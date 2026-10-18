import { randomUUID } from 'node:crypto';
import { migrate } from './db.ts';
import { HttpError, fail, json, readJson } from './http.ts';
import {
  COOKIE, LOCK_MINUTES, MAX_FAILED_LOGINS, checkOrigin, cleanName, cleanPassword, cookieValue, dummyHash, hashPassword, makeSession,
  readSession, sessionCookie, verifyPassword,
} from './auth.ts';
import { createLobby, getGame, joinGame, leaveGame, listGames, playAction, ranking, setAi, startGame } from './games.ts';
import type { Db, User } from './types.ts';

/** Lo que recibe cada ruta: la petición, su URL y el usuario con sesión (o null). */
type RouteCtx = { request: Request; url: URL; user: User | null };
type Route = [method: string, pattern: RegExp, auth: boolean, run: (ctx: RouteCtx, m: RegExpExecArray) => Response | Promise<Response>];

/**
 * La API: `createApp({ db, secret }).handle(request) → Response`. Solo usa Request/Response estándar, así que la misma
 * aplicación corre en una función de Vercel (api/[...path].js), en el servidor de desarrollo de Vite y en los tests.
 *
 *   POST /api/register {name, password}   POST /api/login {name, password}   POST /api/logout   GET /api/me
 *   GET  /api/ranking
 *   GET  /api/games                       POST /api/games {size}
 *   GET  /api/games/:id[?since=versión]   POST /api/games/:id/{join,leave,start}
 *   POST /api/games/:id/ai {add}          POST /api/games/:id/action {action, version}
 */

export function createApp({ db, secret, now = Date.now }: { db: Db; secret: string | undefined; now?: () => number }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
  const ready = migrate(db); // las tablas se crean la primera vez; si falla, se reintenta en la siguiente petición
  ready.catch(() => {});
  let migrated = ready;

  const publicUser = (u: User) => ({ id: u.id, name: u.name, rating: u.rating, games: u.games, wins: u.wins });

  async function currentUser(request: Request): Promise<User | null> {
    const session = readSession(secret as string, cookieValue(request, COOKIE), now());
    if (!session) return null;
    const [user] = await db.query('SELECT id, name, rating, games, wins FROM users WHERE id = $1 AND session_version = $2', [session.id, session.version]);
    return user ?? null;
  }

  const secure = (request: Request) => new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const withSession = (body: unknown, request: Request, userId: number, version = 0) => json(body, 200, { 'set-cookie': sessionCookie(makeSession(secret as string, userId, version, now()), { secure: secure(request) }) });

  async function register(request: Request) {
    const body = await readJson(request);
    const { name, key } = cleanName(body.name);
    const password = cleanPassword(body.password);
    const [user] = await db.query(
      `INSERT INTO users (name, name_key, pass_hash) VALUES ($1, $2, $3) ON CONFLICT (name_key) DO NOTHING RETURNING id, name, rating, games, wins`,
      [name, key, await hashPassword(password)]);
    if (!user) fail(409, 'Ese nombre ya está cogido');
    return withSession({ user: publicUser(user) }, request, user.id);
  }

  async function login(request: Request) {
    const body = await readJson(request);
    const { key } = cleanName(body.name);
    const password = String(body.password ?? '').slice(0, 200);
    const [user] = await db.query('SELECT * FROM users WHERE name_key = $1', [key]);
    if (!user) {
      await verifyPassword(password, await dummyHash()); // mismo tiempo que con un usuario real
      fail(401, 'Nombre o contraseña incorrectos');
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > now()) fail(429, 'Demasiados intentos fallidos: espera unos minutos');
    if (!(await verifyPassword(password, user.pass_hash))) {
      await db.query( // al llegar al máximo se bloquea la cuenta 15 minutos y el contador empieza de cero
        `UPDATE users SET
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN $3::timestamptz ELSE locked_until END,
           failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END
         WHERE id = $1`, [user.id, MAX_FAILED_LOGINS, new Date(now() + LOCK_MINUTES * 60_000).toISOString()]);
      fail(401, 'Nombre o contraseña incorrectos');
    }
    await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    return withSession({ user: publicUser(user) }, request, user.id, user.session_version);
  }

  // [método, patrón, necesita sesión, función]. `m` son los grupos del patrón.
  const ROUTES: Route[] = [
    ['POST', /^\/register$/, false, (ctx) => register(ctx.request)],
    ['POST', /^\/login$/, false, (ctx) => login(ctx.request)],
    ['POST', /^\/logout$/, false, async (ctx) => {
      if (ctx.user) await db.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [ctx.user.id]); // invalida también la cookie copiada
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', { secure: secure(ctx.request), clear: true }) });
    }],
    ['GET', /^\/me$/, false, (ctx) => json({ user: ctx.user ? publicUser(ctx.user) : null })],
    ['GET', /^\/ranking$/, false, async () => json({ ranking: await ranking(db) })],
    ['GET', /^\/games$/, true, async (ctx) => json(await listGames(db, ctx.user!))],
    ['POST', /^\/games$/, true, async (ctx) => json(await createLobby(db, ctx.user!, await readJson(ctx.request) as { size: number }), 201)],
    ['GET', /^\/games\/([\w-]+)$/, true, async (ctx, m) => {
      const since = ctx.url.searchParams.get('since');
      return json(await getGame(db, ctx.user!, m[1], since == null ? null : Number(since)));
    }],
    ['POST', /^\/games\/([\w-]+)\/join$/, true, async (ctx, m) => json(await joinGame(db, ctx.user!, m[1]))],
    ['POST', /^\/games\/([\w-]+)\/leave$/, true, async (ctx, m) => json(await leaveGame(db, ctx.user!, m[1]))],
    ['POST', /^\/games\/([\w-]+)\/start$/, true, async (ctx, m) => json(await startGame(db, ctx.user!, m[1]))],
    ['POST', /^\/games\/([\w-]+)\/ai$/, true, async (ctx, m) => json(await setAi(db, ctx.user!, m[1], (await readJson(ctx.request)).add !== false))],
    ['POST', /^\/games\/([\w-]+)\/action$/, true, async (ctx, m) => {
      const body = await readJson(ctx.request);
      if (!Number.isSafeInteger(body.version)) fail(400, 'Falta la versión de la partida');
      return json(await playAction(db, ctx.user!, m[1], body.action, body.version));
    }],
  ];

  async function handle(request: Request): Promise<Response> {
    const requestId = randomUUID().slice(0, 8);
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api/, '') || '/';
      const matches = ROUTES.map(([method, pattern, auth, run]) => ({ method, m: pattern.exec(path), auth, run })).filter((r) => r.m);
      if (!matches.length) fail(404, 'No encontrado');
      const route = matches.find((r) => r.method === request.method);
      if (!route) fail(405, 'Método no permitido');
      if (request.method !== 'GET' && request.method !== 'HEAD') checkOrigin(request);
      await (migrated = migrated.catch(() => migrate(db)));
      const user = await currentUser(request);
      if (route.auth && !user) fail(401, 'Inicia sesión');
      return await route.run({ request, url, user }, route.m!);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
      console.error(`[${requestId}]`, error); // el detalle se queda en el registro del servidor
      return json({ error: `Error del servidor (${requestId})` }, 500);
    }
  }

  return { handle };
}
