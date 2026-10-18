import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Los tipos de TypeScript se borran al compilar: si la migración no ha cambiado nada más, lo que genera Vite (la web y,
 * con --ssr, la función del servidor) tiene que salir idéntico byte a byte al de la versión en JavaScript.
 *
 *   node tests/golden/bundle.js [ref]   compara con la ref de git (por defecto, la etiqueta pre-ts)
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const ref = process.argv[2] ?? 'pre-ts';
const work = mkdtempSync(join(tmpdir(), 'iki-bundle-'));
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function build(dir, out) {
  const entry = ['ts', 'js'].map((ext) => `api/[...path].${ext}`).find((f) => existsSync(join(dir, f)));
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'error', '--outDir', join(out, 'web')], { cwd: dir, stdio: 'inherit' });
  execFileSync(process.execPath, [vite, 'build', '--logLevel', 'error', '--ssr', entry, '--outDir', join(out, 'server')], { cwd: dir, stdio: 'inherit' });
}

const files = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
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
    process.exitCode = 1;
  } else {
    console.log(`✓ ${fa.length} archivos generados idénticos byte a byte a ${ref} (web y servidor)`);
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', join(work, 'src')], { cwd: root, stdio: 'ignore' });
  rmSync(work, { recursive: true, force: true });
}
