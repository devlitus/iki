import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Los tipos de TypeScript se borran al compilar: si la migración no ha cambiado nada más, lo que genera Vite (la web y,
 * con --ssr, la función del servidor) tiene que salir idéntico byte a byte al de la versión en JavaScript. Todo va
 * minificado: sin minificar, esbuild parte los objetos en líneas de forma distinta en .ts y en .js.
 *
 *   node tests/golden/bundle.js [ref]   compara con la ref de git (por defecto, la etiqueta pre-ts)
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const ref = process.argv[2] ?? 'pre-ts';
const work = mkdtempSync(join(tmpdir(), 'iki-bundle-'));
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function build(dir: string, out: string) {
  const entry = ['server/vercel.ts', 'api/[...path].ts', 'api/[...path].js'].find((f) => existsSync(join(dir, f)));
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'error', '--outDir', join(out, 'web')], { cwd: dir, stdio: 'inherit' });
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'error', '--ssr', entry!, '--minify', 'esbuild', '--outDir', join(out, 'server')], { cwd: dir, stdio: 'inherit' });
}

const files = (dir: string) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile()).map((d) => relative(dir, join(d.parentPath, d.name))).sort();

try {
  const refDir = join(work, 'src');
  execFileSync('git', ['worktree', 'add', '--detach', refDir, ref], { cwd: root, stdio: 'ignore' });
  symlinkSync(join(root, 'node_modules'), join(refDir, 'node_modules'));
  build(refDir, join(work, 'ref'));
  build(root, join(work, 'now'));

  const [a, b] = [join(work, 'ref'), join(work, 'now')];
  const fa = files(a);
  const fb = files(b);
  const differ = [...new Set([...fa, ...fb])].filter((f) => !fa.includes(f) || !fb.includes(f) || !readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
  if (differ.length) {
    console.log(`✗ ${differ.length} archivos difieren de ${ref}:\n${differ.map((f) => `  ${f}`).join('\n')}`);
    // Los nombres llevan el hash del contenido: se emparejan sin él y el código minificado se parte por sentencias.
    const unhashed = (f: string) => f.replace(/-[\w-]{8}(\.\w+)$/, '$1');
    const pairs = fa.filter((x) => differ.includes(x)).map((x) => [x, fb.find((y) => differ.includes(y) && unhashed(y) === unhashed(x))]).filter(([, y]) => y);
    for (const [x, y] of pairs.slice(0, 3)) {
      const split = (dir: string, f: string, name: string) => {
        const out = join(work, name);
        writeFileSync(out, readFileSync(join(dir, f), 'utf8').replaceAll(';', ';\n'));
        return out;
      };
      const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '-U1', split(a, x!, 'a.txt'), split(b, y!, 'b.txt')], { encoding: 'utf8' }).stdout;
      console.log(`\n${x} → ${y}\n${diff.split('\n').slice(4, 60).map((l) => l.slice(0, 300)).join('\n')}`);
    }

    process.exitCode = 1;
  } else {
    console.log(`✓ ${fa.length} archivos generados idénticos byte a byte a ${ref} (web y servidor)`);
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', join(work, 'src')], { cwd: root, stdio: 'ignore' });
  rmSync(work, { recursive: true, force: true });
}
