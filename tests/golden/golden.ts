import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Grabación de referencia del comportamiento del juego (ver capture.js).
 *
 *   node tests/golden/golden.js record [filtro]   graba en tests/golden/fixtures/
 *   node tests/golden/golden.js check [filtro]    graba en una carpeta temporal y compara con fixtures/ byte a byte
 *
 * Los escenarios se reparten entre varios procesos; cada uno escribe sus archivos y el principal los compara.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures');
const mode = process.argv[2];
const filter = (mode === '--worker' ? process.argv[6] : process.argv[3]) ?? '';

/** Un escenario por archivo; los arrays de primer nivel, un elemento por línea (así un diff de git es legible). */
const format = (data) => `{\n${Object.entries(data).map(([k, v]) => `${JSON.stringify(k)}: ${Array.isArray(v)
  ? `[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`
  : JSON.stringify(v)}`).join(',\n')}\n}\n`;

async function worker(outDir, index, count) {
  const { scenarios } = await import('./capture.ts');
  const list = scenarios().filter(([name]) => name.includes(filter)).filter((_, i) => i % count === index);
  for (const [name, run] of list) {
    const started = performance.now();
    let data;
    try {
      data = await run();
    } catch (e) {
      data = { crashed: `${e?.constructor?.name}: ${e?.message}` };
    }
    await writeFile(join(outDir, `${name}.json`), format(data));
    process.stdout.write(`  ${name} (${Math.round(performance.now() - started)} ms)\n`);
  }
}

function runWorkers(outDir) {
  const count = Math.max(1, Math.min(8, availableParallelism() - 1));
  return Promise.all(Array.from({ length: count }, (_, i) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', outDir, String(i), String(count), filter], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`el proceso ${i} terminó con código ${code}`))));
  })));
}

/** Primera diferencia entre dos valores JSON, como ruta legible. */
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}${Array.isArray(a) ? `[${k}]` : `.${k}`}`);
      if (d) return d;
    }
  }
  return `${path || '(raíz)'}: esperado ${JSON.stringify(a)?.slice(0, 200)} · obtenido ${JSON.stringify(b)?.slice(0, 200)}`;
}

if (mode === '--worker') {
  const [outDir, index, count] = process.argv.slice(3);
  await worker(outDir, Number(index), Number(count));
} else if (mode === 'record') {
  await mkdir(FIXTURES, { recursive: true });
  if (!filter) for (const f of await readdir(FIXTURES)) await rm(join(FIXTURES, f));
  await runWorkers(FIXTURES);
  console.log(`Grabado en ${FIXTURES}`);
} else if (mode === 'check') {
  const outDir = join(here, '.check');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir);
  await runWorkers(outDir);
  const expected = (await readdir(FIXTURES)).filter((f) => f.endsWith('.json') && f.includes(filter)).sort();
  const got = new Set(await readdir(outDir));
  let failures = 0;
  for (const file of expected) {
    if (!got.has(file)) { failures++; console.log(`✗ ${file}: no se ha generado`); continue; }
    const [a, b] = await Promise.all([readFile(join(FIXTURES, file), 'utf8'), readFile(join(outDir, file), 'utf8')]);
    if (a === b) continue;
    failures++;
    console.log(`✗ ${file}: ${firstDiff(JSON.parse(a), JSON.parse(b))}`);
  }
  for (const file of got) if (!expected.includes(file)) { failures++; console.log(`✗ ${file}: escenario nuevo sin grabación`); }
  if (failures) {
    console.log(`\n${failures} de ${expected.length} escenarios difieren (salida en ${outDir})`);
    process.exit(1);
  }
  await rm(outDir, { recursive: true, force: true });
  console.log(`\n✓ ${expected.length} escenarios idénticos byte a byte a la grabación de referencia`);
} else {
  console.log('Uso: node tests/golden/golden.js record|check [filtro]');
  process.exit(2);
}
