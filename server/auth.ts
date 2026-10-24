import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fail } from './http.ts';

/**
 * Cuentas y sesiones. Contraseñas con scrypt (sin dependencias); la sesión es una cookie firmada con HMAC: el
 * navegador no puede cambiar de usuario ni alargarla porque no conoce SESSION_SECRET.
 */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;
export const COOKIE = 'iki_session';
export const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: unknown) {
  const [scheme, N, r, p, salt, key] = String(stored).split('$');
  if (scheme !== 'scrypt' || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

/** Hash de relleno: un nombre que no existe tarda lo mismo en rechazarse que una contraseña mala, y no delata qué nombres existen. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword('relleno'));

// --- Datos de la cuenta ------------------------------------------------------------------------

/** Nombre normalizado y su clave única (sin mayúsculas); falla si no es válido. */
export function cleanName(raw: unknown) {
  const name = String(raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 20) fail(400, 'El nombre debe tener entre 3 y 20 caracteres');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name)) fail(400, 'El nombre solo puede llevar letras, números, espacios, _ . y -');
  return { name, key: name.toLowerCase() };
}

export function cleanPassword(raw: unknown) {
  const password = String(raw ?? '');
  if (password.length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres');
  if (password.length > 200) fail(400, 'La contraseña es demasiado larga');
  return password;
}

// --- Sesión ------------------------------------------------------------------------------------

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** `version` es la `session_version` de la cuenta: al cerrar sesión se sube y deja de valer cualquier cookie anterior. */
export function makeSession(secret: string, userId: number, version: number, nowMs: number) {
  const body = `${userId}.${version}.${Math.floor(nowMs / 1000) + SESSION_DAYS * 86400}`;
  return `${body}.${sign(secret, body)}`;
}

/** `{ id, version }` de una sesión con firma válida y sin caducar, o null. */
export function readSession(secret: string, token: string | null, nowMs: number) {
  const [id, version, exp, mac] = String(token ?? '').split('.');
  if (!mac) return null;
  const expected = Buffer.from(sign(secret, `${id}.${version}.${exp}`));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(exp) * 1000 < nowMs) return null;
  return Number.isInteger(Number(id)) && Number.isInteger(Number(version)) ? { id: Number(id), version: Number(version) } : null;
}

export function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Cabecera Set-Cookie. `Secure` salvo en http (desarrollo local). */
export function sessionCookie(token: string, { secure, clear = false }: { secure: boolean; clear?: boolean }) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  if (secure) attrs.push('Secure');
  return `${COOKIE}=${clear ? '' : token}; ${attrs.join('; ')}`;
}

/**
 * Defensa contra CSRF en las peticiones que cambian algo: el origen debe ser esta misma web. (Además la cookie es
 * SameSite=Lax y el cuerpo debe ser JSON, que el navegador no manda entre sitios sin permiso.)
 */
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  if (!origin) fail(403, 'Falta el origen de la petición');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    fail(403, 'Origen no válido');
  }
  if (originHost !== host) fail(403, 'Origen no permitido');
}
