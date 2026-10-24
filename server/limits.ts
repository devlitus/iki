import { fail } from './http.ts';
import type { Db } from './types.ts';

/**
 * Límites por IP contra los scripts: cuántas cuentas se crean, cuántos logins se intentan (cada uno cuesta un scrypt) y
 * cuántos fallan. Van por IP y no por cuenta, así que nadie puede bloquear la cuenta de otro probando contraseñas.
 *
 * Contador de ventana fija en la tabla `rate_limits`, con una sola sentencia (Neon por HTTP no tiene transacciones).
 */

export type Limit = { max: number; minutes: number };

export const LIMITS = {
  register: { max: 10, minutes: 60 }, // cuentas nuevas
  login: { max: 30, minutes: 15 }, // intentos de login, buenos o malos
  loginFail: { max: 10, minutes: 15 }, // logins fallidos, contra cualquier cuenta
} satisfies Record<string, Limit>;

/**
 * IP del cliente. En Vercel `x-real-ip` y `x-forwarded-for` las pone el propio Vercel (pisa lo que mande el navegador).
 * Una IPv6 se reduce a su /64: cualquiera tiene millones de direcciones dentro del suyo.
 */
export function clientIp(request: Request) {
  const raw = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  const ip = raw.trim().replace(/^\[|\](:\d+)?$/g, '').replace(/%.*$/, '').toLowerCase();
  if (!ip) return 'local';
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip.replace(/^::ffff:/, '');
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

const COUNT = `
  INSERT INTO rate_limits (key, window_start, hits) VALUES ($1, $2::bigint, 1)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN rate_limits.window_start <= $2::bigint - $3::bigint THEN 1 ELSE rate_limits.hits + 1 END,
    window_start = CASE WHEN rate_limits.window_start <= $2::bigint - $3::bigint THEN $2::bigint ELSE rate_limits.window_start END
  RETURNING hits, window_start`;

const tooMany = (windowStart: number, limit: Limit, nowMs: number) =>
  fail(429, `Demasiados intentos: espera ${Math.max(1, Math.ceil((windowStart + limit.minutes * 60_000 - nowMs) / 60_000))} min`);

/** Suma un intento a `key`; con el que pase del máximo, 429. */
export async function hit(db: Db, key: string, limit: Limit, nowMs: number) {
  if (Math.random() < 0.02) await db.query('DELETE FROM rate_limits WHERE window_start < $1::bigint', [nowMs - 86_400_000]); // limpieza de vez en cuando
  const [row] = await db.query(COUNT, [key, nowMs, limit.minutes * 60_000]);
  if (row.hits > limit.max) tooMany(Number(row.window_start), limit, nowMs);
}

/** 429 si `key` ya llegó al máximo en esta ventana (sin sumar nada). */
export async function check(db: Db, key: string, limit: Limit, nowMs: number) {
  const [row] = await db.query('SELECT hits, window_start FROM rate_limits WHERE key = $1 AND window_start > $2::bigint', [key, nowMs - limit.minutes * 60_000]);
  if (row && row.hits >= limit.max) tooMany(Number(row.window_start), limit, nowMs);
}

/** Suma un intento a `key` sin rechazar este (el siguiente lo para `check`). */
export async function record(db: Db, key: string, limit: Limit, nowMs: number) {
  await db.query(COUNT, [key, nowMs, limit.minutes * 60_000]);
}
