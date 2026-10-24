import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * Build para Vercel con la Build Output API (https://vercel.com/docs/build-output-api/v3): la web de Vite como estáticos
 * y la API como una sola función ya empaquetada en JavaScript. Así Vercel no compila TypeScript (su compilador usa la
 * API de JS de `typescript`, que la 7 ya no tiene) ni se topa con los imports `.ts`.
 *
 *   node scripts/build-vercel.ts
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

rmSync(out, { recursive: true, force: true });

execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'dist'), join(out, 'static'), { recursive: true });

await build({
  entryPoints: [join(root, 'server', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Algunas dependencias en CommonJS piden require(): en ESM hay que crearlo.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
mkdirSync(fn, { recursive: true });
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false, // node-adapter lee el cuerpo él mismo
  maxDuration: 30,
}, null, 2));

writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    {
      src: '/(.*)',
      headers: { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' },
      continue: true,
    },
    { handle: 'filesystem' },
    // La función ve la URL original (/api/…): app.ts enruta por ella.
    { src: '^/api(/.*)?$', dest: '/api' },
  ],
}, null, 2));

console.log(`✓ ${join('.vercel', 'output')} listo (estáticos + función api)`);
