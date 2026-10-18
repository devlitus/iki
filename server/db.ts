import { neon } from '@neondatabase/serverless';
import type { Db } from './types.ts';

/**
 * Base de datos: Postgres. Todo el servidor habla con ella a través de `db.query(sql, params) → filas`, así que el mismo
 * SQL corre en producción (Neon, por HTTP: encaja con las funciones de Vercel, que no mantienen conexiones) y en
 * desarrollo y tests (PGlite, un Postgres real en WASM: db-local.js).
 *
 * Neon por HTTP no admite transacciones interactivas, así que cada cambio que debe ser atómico es UNA sentencia (con CTE)
 * y la concurrencia es optimista: `UPDATE … WHERE version = $esperada`.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    name_key      TEXT NOT NULL UNIQUE,
    pass_hash     TEXT NOT NULL,
    rating        INTEGER NOT NULL DEFAULT 1000,
    games         INTEGER NOT NULL DEFAULT 0,
    wins          INTEGER NOT NULL DEFAULT 0,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    session_version INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`, // bases creadas antes de las sesiones revocables
  // Un registro por partida. `state` es el estado COMPLETO (con la semilla y los mazos): no sale nunca del servidor.
  `CREATE TABLE IF NOT EXISTS games (
    id         TEXT PRIMARY KEY,
    status     TEXT NOT NULL CHECK (status IN ('lobby', 'playing', 'ended', 'cancelled')),
    host       INTEGER NOT NULL REFERENCES users(id),
    size       INTEGER NOT NULL CHECK (size BETWEEN 3 AND 4),
    seats      JSONB NOT NULL,
    ranked     BOOLEAN NOT NULL DEFAULT false,
    state      JSONB,
    version    INTEGER NOT NULL DEFAULT 0,
    settled    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Registro de jugadas, solo para añadir: con la semilla, reproduce la partida entera y sirve para auditarla.
  `CREATE TABLE IF NOT EXISTS game_actions (
    game_id TEXT NOT NULL REFERENCES games(id),
    seq     INTEGER NOT NULL,
    seat    INTEGER NOT NULL,
    action  JSONB NOT NULL,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, seq)
  )`,
  `CREATE TABLE IF NOT EXISTS results (
    game_id       TEXT NOT NULL REFERENCES games(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    place         INTEGER NOT NULL,
    score         INTEGER NOT NULL,
    rating_before INTEGER NOT NULL,
    rating_after  INTEGER NOT NULL,
    PRIMARY KEY (game_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS games_status_idx ON games (status, updated_at DESC)`,
];

/** Crea las tablas que falten. Se puede lanzar tantas veces como se quiera. */
export async function migrate(db: Db) {
  for (const statement of SCHEMA) await db.query(statement);
}

/** Neon por HTTP (producción). */
export function neonDb(url: string | undefined): Db {
  if (!url) throw new Error('Falta DATABASE_URL');
  const sql = neon(url);
  return { query: (text, params = []) => sql.query(text, params) as Promise<any[]> };
}
