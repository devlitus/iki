import { randomBytes } from 'node:crypto';
import { createGame } from '../src/game/setup.js';
import { act, legalActions } from '../src/game/engine.js';
import { RuleError } from '../src/game/state.js';
import { publicView } from '../src/game/view.js';
import { createRng, secretSeed } from '../src/game/random.js';
import { chooseAction, deciderOf, isAiTurn } from '../src/ai/player.js';
import { PLAYER_BOARDS } from '../src/data/playerBoards.js';
import { eloDeltas } from './rating.js';
import { fail, HttpError } from './http.js';

/**
 * Partidas alojadas. Aquí está la autoridad: el navegador solo manda «quiero hacer esto» y el servidor
 *   1. comprueba que la partida está en marcha y que quien pregunta está sentado y es SU turno,
 *   2. valida la acción con el motor (el mismo del navegador, pero el que cuenta es este),
 *   3. juega los turnos de las IA que vengan después,
 *   4. guarda estado, versión y registro de jugadas de una vez,
 * y responde con la vista pública (src/game/view.js): sin semilla ni mazos.
 */

const MAX_ACTIVE_GAMES = 6; // salas y partidas en curso por jugador
const MAX_AI_ACTIONS = 800; // tope de seguridad de una cadena de jugadas de IA
const GAME_ID = /^[\w-]{6,16}$/;

/** Acciones que puede mandar un navegador (`start` es interna) y los campos que pueden llevar. */
const ACTION_TYPES = new Set(['placeInitial', 'placeIkizama', 'income', 'hire', 'move', 'shop', 'character', 'endTurn', 'place', 'resolve']);
const ACTION_FIELDS = new Set(['type', 'card', 'lot', 'base', 'sandals', 'bonus', 'slot', 'zone', 'pipe', 'bag', 'target', 'choice', 'building', 'buildLot', 'fish', 'lots', 'drop', 'use', 'cardType']);

/** Acción tal como la acepta el servidor: un objeto plano con campos conocidos y valores simples. */
export function cleanAction(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'Acción no válida');
  if (!ACTION_TYPES.has(raw.type)) fail(400, 'Acción desconocida');
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ACTION_FIELDS.has(key)) fail(400, `Campo no permitido: ${key.slice(0, 20)}`);
    const simple = (v) => (typeof v === 'string' && v.length <= 64) || typeof v === 'boolean' || Number.isSafeInteger(v);
    const ok = simple(value) || (Array.isArray(value) && value.length <= 10 && value.every((v) => typeof v === 'string' && v.length <= 64));
    if (!ok) fail(400, `Valor no válido en ${key}`);
    out[key] = value;
  }
  return out;
}

const asJson = (v) => (v === undefined ? null : JSON.stringify(v));
const seatOf = (row, userId) => (userId == null ? -1 : row.seats.findIndex((s) => s.user === userId));

async function load(db, id) {
  if (!GAME_ID.test(String(id))) fail(404, 'Partida no encontrada');
  const [row] = await db.query('SELECT * FROM games WHERE id = $1', [id]);
  return row ?? fail(404, 'Partida no encontrada');
}

/** Lo que se cuenta de una partida a quien pregunta (sin ids de otros usuarios, sin estado). */
function summary(row, user) {
  return {
    id: row.id,
    status: row.status,
    size: row.size,
    ranked: row.ranked,
    version: row.version,
    isHost: user?.id === row.host,
    me: seatOf(row, user?.id),
    seats: row.seats.map((s) => (s.free ? { free: true } : { name: s.name, ai: Boolean(s.ai), host: s.user === row.host })),
  };
}

/** Lo mismo con la partida a la vista (solo para quien está sentado). */
function detail(row, user, results = null) {
  const out = summary(row, user);
  if (row.state) out.view = publicView(row.state);
  if (results) out.results = results;
  return out;
}

// --- Guardado atómico --------------------------------------------------------------------------

const SAVE = `
  WITH upd AS (
    UPDATE games SET
      seats  = COALESCE($2::jsonb, seats),
      state  = COALESCE($3::jsonb, state),
      status = COALESCE($4::text, status),
      ranked = COALESCE($5::boolean, ranked),
      host   = COALESCE($9::int, host),
      version = version + $6::int,
      updated_at = now()
    WHERE id = $1 AND version = $7::int
    RETURNING id
  ), ins AS (
    INSERT INTO game_actions (game_id, seq, seat, action)
    SELECT $1, $7::int + x.n, x.seat, x.action FROM upd, jsonb_to_recordset($8::jsonb) AS x(n int, seat int, action jsonb)
  )
  SELECT id FROM upd`;

/**
 * Guarda los cambios SI la partida sigue en la versión que se leyó (si otra petición se adelantó, no escribe nada y
 * devuelve false). Estado, versión y jugadas se escriben en la misma sentencia: o todo o nada.
 */
async function save(db, row, patch, actions = []) {
  const entries = actions.map((a, i) => ({ n: i + 1, seat: a.seat, action: a.action }));
  const rows = await db.query(SAVE, [row.id, asJson(patch.seats), asJson(patch.state), patch.status ?? null, patch.ranked ?? null,
    Math.max(1, entries.length), row.version, JSON.stringify(entries), patch.host ?? null]);
  return rows.length > 0;
}

const conflict = () => fail(409, 'La partida ha cambiado, inténtalo de nuevo', { conflict: true });

// --- Salas -------------------------------------------------------------------------------------

async function activeGames(db, user) {
  const [{ n }] = await db.query(
    `SELECT count(*)::int AS n FROM games WHERE status IN ('lobby', 'playing') AND seats @> $1::jsonb`,
    [JSON.stringify([{ user: user.id }])]);
  return n;
}

export async function createLobby(db, user, { size }) {
  if (size !== 3 && size !== 4) fail(400, 'La partida es de 3 o 4 jugadores');
  if ((await activeGames(db, user)) >= MAX_ACTIVE_GAMES) fail(409, 'Tienes demasiadas partidas abiertas');
  const id = randomBytes(6).toString('base64url');
  const seats = [{ user: user.id, name: user.name }, ...Array.from({ length: size - 1 }, () => ({ free: true }))];
  await db.query(`INSERT INTO games (id, status, host, size, seats) VALUES ($1, 'lobby', $2, $3, $4::jsonb)`, [id, user.id, size, JSON.stringify(seats)]);
  return detail(await load(db, id), user);
}

export async function listGames(db, user) {
  const mine = await db.query(
    `SELECT * FROM games WHERE seats @> $1::jsonb AND (status IN ('lobby', 'playing') OR (status = 'ended' AND updated_at > now() - interval '7 days'))
     ORDER BY updated_at DESC LIMIT 20`, [JSON.stringify([{ user: user.id }])]);
  const open = await db.query(
    `SELECT * FROM games WHERE status = 'lobby' AND seats @> '[{"free": true}]'::jsonb AND NOT seats @> $1::jsonb
     ORDER BY created_at DESC LIMIT 20`, [JSON.stringify([{ user: user.id }])]);
  return { mine: mine.map((r) => summary(r, user)), open: open.map((r) => summary(r, user)) };
}

export async function getGame(db, user, id, since = null) {
  if (since != null) {
    if (!GAME_ID.test(String(id))) fail(404, 'Partida no encontrada');
    const [v] = await db.query('SELECT version, status, seats FROM games WHERE id = $1', [id]);
    if (!v) fail(404, 'Partida no encontrada');
    if (v.version === since && (v.status === 'lobby' || seatOf(v, user.id) >= 0)) return { unchanged: true, version: v.version, status: v.status };
  }
  const row = await load(db, id);
  if (row.status !== 'lobby' && seatOf(row, user.id) < 0) fail(403, 'No juegas en esta partida');
  let results = null;
  if (row.status === 'ended' && row.ranked) {
    if (!row.settled) await settle(db, row); // por si el servidor cayó justo entre guardar el final y apuntar el resultado
    results = await db.query(
      `SELECT r.place, r.score, r.rating_before AS "ratingBefore", r.rating_after AS "ratingAfter", u.name
       FROM results r JOIN users u ON u.id = r.user_id WHERE r.game_id = $1 ORDER BY r.place`, [id]);
  }
  return detail(row, user, results);
}

/** Cambia la sala (con reintentos si otra petición se adelanta). `change(row)` devuelve el parche o lanza un error. */
async function editLobby(db, id, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await load(db, id);
    if (row.status !== 'lobby') fail(409, 'La partida ya no está en la sala de espera');
    const { patch, actions = [] } = await change(row);
    if (await save(db, row, patch, actions)) return load(db, id);
  }
  return conflict();
}

export async function joinGame(db, user, id) {
  if ((await activeGames(db, user)) >= MAX_ACTIVE_GAMES) fail(409, 'Tienes demasiadas partidas abiertas');
  const row = await editLobby(db, id, (row) => {
    if (seatOf(row, user.id) >= 0) fail(409, 'Ya estás en esta partida');
    const free = row.seats.findIndex((s) => s.free);
    if (free < 0) fail(409, 'La partida está completa');
    const seats = row.seats.map((s, i) => (i === free ? { user: user.id, name: user.name } : s));
    return { patch: { seats } };
  });
  return detail(row, user);
}

export async function leaveGame(db, user, id) {
  const row = await editLobby(db, id, (row) => {
    if (seatOf(row, user.id) < 0) fail(409, 'No estás en esta partida');
    const seats = row.seats.map((s) => (s.user === user.id ? { free: true } : s));
    const humans = seats.filter((s) => s.user != null);
    if (!humans.length) return { patch: { seats, status: 'cancelled' } }; // la sala se queda sin nadie
    return { patch: { seats, host: row.host === user.id ? humans[0].user : undefined } };
  });
  return summary(row, user);
}

/** El anfitrión rellena un asiento libre con una IA, o quita la última. */
export async function setAi(db, user, id, add) {
  const row = await editLobby(db, id, (row) => {
    if (row.host !== user.id) fail(403, 'Solo el anfitrión puede cambiar los asientos');
    let seats;
    if (add) {
      const free = row.seats.findIndex((s) => s.free);
      if (free < 0) fail(409, 'No quedan asientos libres');
      seats = row.seats.map((s, i) => (i === free ? { ai: true, name: 'IA' } : s));
    } else {
      const last = row.seats.findLastIndex((s) => s.ai);
      if (last < 0) fail(409, 'No hay ninguna IA que quitar');
      seats = row.seats.map((s, i) => (i === last ? { free: true } : s));
    }
    return { patch: { seats } };
  });
  return detail(row, user);
}

// --- Partida -----------------------------------------------------------------------------------

/**
 * Juega los turnos de IA que toquen y devuelve el estado resultante; cada jugada se añade a `actions`. Si la IA fallara,
 * se juega la primera jugada legal en su lugar (mejor una jugada mala que la partida bloqueada para siempre).
 */
function runAi(state, actions) {
  while (isAiTurn(state) && actions.length < MAX_AI_ACTIONS) {
    const seat = deciderOf(state);
    let action;
    try {
      action = chooseAction(state);
      state = act(state, action);
    } catch (error) {
      console.error('La IA no ha podido jugar; se usa una jugada legal', error);
      const legal = legalActions(state);
      action = legal.find((a) => a.type === 'endTurn') ?? legal[0];
      if (!action) break;
      state = act(state, action);
    }
    actions.push({ seat, action });
  }
  return state;
}

export async function startGame(db, user, id) {
  const row = await editLobby(db, id, (row) => {
    if (row.host !== user.id) fail(403, 'Solo el anfitrión puede empezar');
    if (row.seats.some((s) => s.free)) fail(409, 'Faltan jugadores: rellena los asientos libres o añade una IA');
    const rng = createRng(secretSeed());
    const seats = rng.shuffle(row.seats); // el orden en la mesa lo decide el azar, no quién creó la sala
    const boards = rng.shuffle(PLAYER_BOARDS.map((b) => b.id));
    const players = seats.map((s, i) => ({ boardId: boards[i], ai: Boolean(s.ai) }));
    const actions = [];
    const state = runAi(createGame({ players, seed: secretSeed() }), actions);
    // Clasificatoria solo si todos son personas: contra IA sería muy fácil sumar puntos.
    const ranked = seats.every((s) => s.user != null);
    return { patch: { seats, state, status: 'playing', ranked }, actions };
  });
  return detail(row, user);
}

export async function playAction(db, user, id, rawAction, version) {
  const row = await load(db, id);
  if (row.status !== 'playing') fail(409, 'La partida no está en curso');
  const seat = seatOf(row, user.id);
  if (seat < 0) fail(403, 'No juegas en esta partida');
  if (version !== row.version) throw conflictWith(row, user);
  const action = cleanAction(rawAction);
  if (deciderOf(row.state) !== seat) fail(409, 'No es tu turno');

  let state;
  try {
    state = act(row.state, action);
  } catch (error) {
    if (error instanceof RuleError) fail(422, error.message);
    console.error('Fallo del motor con una acción de usuario', error);
    fail(422, 'Jugada no válida');
  }
  const actions = [{ seat, action }];
  state = runAi(state, actions);
  const ended = state.phase === 'ended';
  if (!(await save(db, row, { state, status: ended ? 'ended' : undefined }, actions))) throw conflictWith(await load(db, id), user);

  const saved = { ...row, state, status: ended ? 'ended' : row.status, version: row.version + actions.length };
  if (ended && row.ranked) await settle(db, saved);
  return getGame(db, user, id);
}

/** 409 que lleva la partida al día, para que el navegador se actualice sin otra petición. */
const conflictWith = (row, user) =>
  new HttpError(409, 'La partida ha cambiado, inténtalo de nuevo', { conflict: true, game: detail(row, user) });

// --- Final y ranking ---------------------------------------------------------------------------

const SETTLE = `
  WITH claim AS (
    UPDATE games SET settled = true WHERE id = $1 AND status = 'ended' AND ranked AND NOT settled RETURNING id
  ), ins AS (
    INSERT INTO results (game_id, user_id, place, score, rating_before, rating_after)
    SELECT $1, x.user_id, x.place, x.score, u.rating, u.rating + x.delta
    FROM claim, jsonb_to_recordset($2::jsonb) AS x(user_id int, place int, score int, delta int)
    JOIN users u ON u.id = x.user_id
    RETURNING user_id, place, rating_after - rating_before AS delta
  )
  UPDATE users u SET rating = u.rating + ins.delta, games = u.games + 1, wins = u.wins + (ins.place = 1)::int
  FROM ins WHERE u.id = ins.user_id`;

/**
 * Apunta el resultado de una partida clasificatoria y mueve el ranking. Una sola sentencia: la marca `settled` impide
 * apuntarla dos veces aunque lleguen dos peticiones a la vez.
 */
export async function settle(db, row) {
  const { final } = row.state;
  const ids = row.seats.map((s) => s.user);
  const users = await db.query('SELECT id, rating FROM users WHERE id = ANY($1::int[])', [ids]);
  const ratingOf = Object.fromEntries(users.map((u) => [u.id, u.rating]));
  const placed = ids.map((userId, seat) => ({ userId, place: final.ranking.indexOf(seat) + 1, score: final.scores[seat].total, rating: ratingOf[userId] ?? 1000 }));
  const deltas = eloDeltas(placed);
  const rows = placed.map((p, i) => ({ user_id: p.userId, place: p.place, score: p.score, delta: deltas[i] }));
  await db.query(SETTLE, [row.id, JSON.stringify(rows)]);
}

export async function ranking(db) {
  return db.query(`SELECT name, rating, games, wins FROM users WHERE games > 0 ORDER BY rating DESC, wins DESC, name LIMIT 50`);
}
