import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Postgres local para desarrollo y tests (PGlite). Con `dir` guarda los datos en disco; sin él, en memoria.
 * Es Postgres de verdad, así que el SQL que funciona aquí funciona en Neon.
 */
export async function localDb(dir) {
  if (dir) mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    close: () => pg.close(),
  };
}
