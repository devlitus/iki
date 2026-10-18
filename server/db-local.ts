import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './types.ts';

/**
 * Postgres local para desarrollo y tests (PGlite). Con `dir` guarda los datos en disco; sin él, en memoria.
 * Es Postgres de verdad, así que el SQL que funciona aquí funciona en Neon.
 */
export async function localDb(dir?: string): Promise<Db & { close: () => Promise<void> }> {
  if (dir) mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    query: async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as any[],
    close: () => pg.close(),
  };
}
