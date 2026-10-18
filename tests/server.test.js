import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { localDb } from '../server/db-local.ts';
import { createApp } from '../server/app.ts';
import { eloDeltas } from '../server/rating.ts';
import { cleanAction, settle } from '../server/games.ts';
import { act } from '../src/game/engine.ts';
import { chooseAction, deciderOf } from '../src/ai/player.ts';

const SECRET = 'x'.repeat(40);
const ORIGIN = 'http://iki.test';
let db;
let app;
let clock = Date.parse('2026-10-17T10:00:00Z');

before(async () => {
  db = await localDb();
  app = createApp({ db, secret: SECRET, now: () => clock });
});
after(() => db.close());

/** Un navegador: guarda su cookie de sesión y manda las peticiones con el origen de la web. */
function browser() {
  let cookie = '';
  const call = async (method, path, body, { origin = ORIGIN, type = 'application/json' } = {}) => {
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);
    if (origin) headers.set('origin', origin);
    if (body !== undefined) headers.set('content-type', type);
    const res = await app.handle(new Request(`${ORIGIN}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

let counter = 0;
async function signUp(prefix = 'jugador') {
  const b = browser();
  const name = `${prefix}${++counter}`;
  const res = await b.call('POST', '/register', { name, password: 'contraseña-larga' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { b, name, id: res.body.user.id };
}

/** Sala con `humans` personas + `ais` IA, empezada. Devuelve los navegadores y el id. */
async function startedGame(humans, ais = 0) {
  const players = [];
  for (let i = 0; i < humans; i++) players.push(await signUp());
  const [host, ...others] = players;
  const created = await host.b.call('POST', '/games', { size: humans + ais });
  assert.equal(created.status, 201);
  const id = created.body.id;
  for (const p of others) assert.equal((await p.b.call('POST', `/games/${id}/join`, {})).status, 200);
  for (let i = 0; i < ais; i++) assert.equal((await host.b.call('POST', `/games/${id}/ai`, { add: true })).status, 200);
  const started = await host.b.call('POST', `/games/${id}/start`, {});
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return { id, players, game: started.body };
}

const dbGame = async (id) => (await db.query('SELECT * FROM games WHERE id = $1', [id]))[0];

// --- Cuentas -----------------------------------------------------------------------------------

test('registro, sesión, cierre de sesión y nombre repetido', async () => {
  const a = browser();
  assert.equal((await a.call('GET', '/me')).body.user, null);
  const reg = await a.call('POST', '/register', { name: 'Hiroshige', password: 'una-clave-larga' });
  assert.equal(reg.status, 200);
  assert.match(reg.headers.get('set-cookie'), /HttpOnly/);
  assert.match(reg.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await a.call('GET', '/me')).body.user.name, 'Hiroshige');
  assert.equal(JSON.stringify(reg.body).includes('pass'), false, 'nunca se devuelve el hash');

  assert.equal((await browser().call('POST', '/register', { name: 'hiroshige', password: 'otra-clave-larga' })).status, 409, 'sin distinguir mayúsculas');
  await a.call('POST', '/logout', {});
  assert.equal((await a.call('GET', '/me')).body.user, null);
  assert.equal((await a.call('GET', '/games')).status, 401);
});

test('nombres y contraseñas no válidos se rechazan', async () => {
  const b = browser();
  for (const name of ['ab', 'a'.repeat(21), '<script>', '  ', '-guion']) assert.equal((await b.call('POST', '/register', { name, password: 'clave-larga-1' })).status, 400, name);
  assert.equal((await b.call('POST', '/register', { name: 'Correcto', password: 'corta' })).status, 400);
});

test('login: contraseña errónea, usuario inexistente y bloqueo tras 5 fallos', async () => {
  const { name } = await signUp('login');
  const b = browser();
  const wrong = await b.call('POST', '/login', { name, password: 'incorrecta-pero-larga' });
  const ghost = await b.call('POST', '/login', { name: 'nadie-existe', password: 'incorrecta-pero-larga' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, ghost.body, 'el mensaje no delata qué nombres existen');

  for (let i = 0; i < 4; i++) await b.call('POST', '/login', { name, password: 'incorrecta-pero-larga' });
  assert.equal((await b.call('POST', '/login', { name, password: 'contraseña-larga' })).status, 429, 'bloqueado aunque ahora acierte');
  clock += 16 * 60 * 1000;
  assert.equal((await b.call('POST', '/login', { name, password: 'contraseña-larga' })).status, 200, 'se desbloquea a los 15 minutos');
});

test('la cookie no se puede falsificar ni cambiar de usuario ni alargar', async () => {
  const victim = await signUp('victima');
  const attacker = await signUp('atacante');
  const [id, ver, exp, mac] = attacker.b.cookie.split('=')[1].split('.');

  const forge = async (cookie) => { const b = browser(); b.cookie = cookie; return (await b.call('GET', '/me')).body.user; };
  assert.equal((await forge(attacker.b.cookie)).name, attacker.name, 'la propia sí vale');
  assert.equal(await forge(`iki_session=${victim.id}.${exp}.${attacker.b.cookie.split('.')[2]}`), null, 'cambiar el id');
  assert.equal(await forge(`iki_session=${id}.${ver}.${Number(exp) + 9e9}.${mac}`), null, 'alargar la caducidad');
  assert.equal(await forge(`iki_session=${victim.id}.${ver}.${exp}.`), null, 'sin firma');
  assert.equal(await forge('iki_session=1'), null);
  clock += 31 * 86400 * 1000;
  assert.equal(await forge(attacker.b.cookie), null, 'caducada');
  clock -= 31 * 86400 * 1000;
});

test('cerrar sesión invalida también una copia de la cookie', async () => {
  const { b, name } = await signUp('copia');
  const stolen = browser();
  stolen.cookie = b.cookie;
  assert.equal((await stolen.call('GET', '/me')).body.user.name, name);
  await b.call('POST', '/logout', {});
  assert.equal((await stolen.call('GET', '/me')).body.user, null, 'la cookie copiada ya no vale');
  const again = await b.call('POST', '/login', { name, password: 'contraseña-larga' });
  assert.equal(again.status, 200);
  assert.equal((await b.call('GET', '/me')).body.user.name, name, 'volver a entrar da una sesión nueva');
  assert.equal((await stolen.call('GET', '/me')).body.user, null);
});

test('CSRF: origen ajeno, sin origen o cuerpo que no es JSON se rechazan', async () => {
  const { b } = await signUp('csrf');
  assert.equal((await b.call('POST', '/games', { size: 3 }, { origin: 'http://evil.test' })).status, 403);
  assert.equal((await b.call('POST', '/games', { size: 3 }, { origin: null })).status, 403);
  assert.equal((await b.call('POST', '/games', { size: 3 }, { type: 'text/plain' })).status, 415);
  assert.equal((await b.call('POST', '/games', { size: 3 })).status, 201);
});

// --- Salas -------------------------------------------------------------------------------------

test('sala: crear, unirse, IA, dejar, y solo el anfitrión empieza', async () => {
  const host = await signUp();
  const guest = await signUp();
  const { body: room } = await host.b.call('POST', '/games', { size: 3 });
  assert.equal(room.status, 'lobby');
  assert.equal(room.seats.filter((s) => s.free).length, 2);
  assert.ok(room.isHost);

  assert.equal((await host.b.call('POST', `/games/${room.id}/join`, {})).status, 409, 'ya está dentro');
  assert.equal((await guest.b.call('GET', '/games')).body.open.some((g) => g.id === room.id), true, 'aparece en las abiertas');
  assert.equal((await guest.b.call('POST', `/games/${room.id}/join`, {})).status, 200);
  assert.equal((await guest.b.call('POST', `/games/${room.id}/ai`, { add: true })).status, 403, 'solo el anfitrión pone IA');
  assert.equal((await host.b.call('POST', `/games/${room.id}/start`, {})).status, 409, 'faltan jugadores');
  assert.equal((await guest.b.call('POST', `/games/${room.id}/leave`, {})).status, 200);
  await host.b.call('POST', `/games/${room.id}/ai`, { add: true });
  await host.b.call('POST', `/games/${room.id}/ai`, { add: true });
  assert.equal((await host.b.call('POST', `/games/${room.id}/ai`, { add: true })).status, 409, 'sin asientos libres');
  assert.equal((await guest.b.call('POST', `/games/${room.id}/join`, {})).status, 409, 'completa');
  assert.equal((await guest.b.call('POST', `/games/${room.id}/start`, {})).status, 403);
  const started = await host.b.call('POST', `/games/${room.id}/start`, {});
  assert.equal(started.body.status, 'playing');
  assert.equal(started.body.ranked, false, 'con IA no es clasificatoria');
  assert.equal((await guest.b.call('GET', `/games/${room.id}`)).status, 403, 'quien no juega no ve la partida');
});

test('si el anfitrión sale, la sala pasa a otro; si sale el último, se cancela', async () => {
  const host = await signUp();
  const guest = await signUp();
  const { body: room } = await host.b.call('POST', '/games', { size: 3 });
  await guest.b.call('POST', `/games/${room.id}/join`, {});
  await host.b.call('POST', `/games/${room.id}/leave`, {});
  assert.equal((await guest.b.call('GET', `/games/${room.id}`)).body.isHost, true);
  await guest.b.call('POST', `/games/${room.id}/leave`, {});
  assert.equal((await dbGame(room.id)).status, 'cancelled');
});

// --- Autoridad del servidor --------------------------------------------------------------------

test('lo que viaja al navegador no lleva semilla ni el orden de los mazos', async () => {
  const { id, players } = await startedGame(3);
  const real = (await dbGame(id)).state;
  const res = await players[0].b.call('GET', `/games/${id}`);
  const wire = JSON.stringify(res.body);
  assert.equal(res.body.view.seed, undefined);
  assert.equal(res.body.view.rng, null);
  assert.ok(real.seed.length === 4, 'el servidor sí la tiene (128 bits)');
  for (const c of Object.values(real.decks).flat()) assert.ok(!wire.includes(`"${c}"`), `${c} (de un mazo) no debería viajar`);
  for (const t of real.fireTiles) assert.ok(!wire.includes(`"${t}"`), `${t} (loseta de Incendio) no debería viajar`);
  assert.ok(res.body.view.decks.winter.every((c) => c === null));
  assert.ok(res.body.view.fireTiles.every((t) => t === null));
  assert.equal(wire.includes(JSON.stringify(real.seed)), false);
  assert.equal(wire.includes(String(real.rng)), false);
});

test('solo juega quien tiene el turno, con la versión al día y una acción válida', async () => {
  const { id, players } = await startedGame(3);
  const state = (await dbGame(id)).state;
  const seat = deciderOf(state);
  const seats = (await dbGame(id)).seats;
  const turnUser = players.find((p) => p.id === seats[seat].user);
  const other = players.find((p) => p !== turnUser);
  const action = chooseAction(state, { effort: 'fast' });
  const version = (await dbGame(id)).version;

  assert.equal((await other.b.call('POST', `/games/${id}/action`, { action, version })).status, 409, 'no es su turno');
  assert.equal((await turnUser.b.call('POST', `/games/${id}/action`, { action })).status, 400, 'sin versión');
  const stale = await turnUser.b.call('POST', `/games/${id}/action`, { action, version: version - 1 });
  assert.equal(stale.status, 409);
  assert.ok(stale.body.conflict && stale.body.game.view, 'el conflicto trae la partida al día');
  assert.equal((await dbGame(id)).version, version, 'nada ha cambiado');

  const ok = await turnUser.b.call('POST', `/games/${id}/action`, { action, version });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.version, version + 1);
  const log = await db.query('SELECT seq, seat, action FROM game_actions WHERE game_id = $1 ORDER BY seq', [id]);
  assert.equal(log.at(-1).seq, version + 1);
  assert.deepEqual(log.at(-1).action, action);
});

test('acciones manipuladas: campos que no existen, tipos raros, valores imposibles', async () => {
  const { id, players } = await startedGame(3);
  const row = await dbGame(id);
  const turnUser = players.find((p) => p.id === row.seats[deciderOf(row.state)].user);
  const send = (action) => turnUser.b.call('POST', `/games/${id}/action`, { action, version: row.version });
  const good = chooseAction(row.state, { effort: 'fast' });

  for (const bad of [
    null, 'placeInitial', [], { type: 'constructor' }, { type: '__proto__' }, { type: 'start' }, { type: 'toString' },
    { ...good, hack: 1 }, { ...good, lot: { evil: true } }, { ...good, lot: null }, { ...good, card: 'x'.repeat(100) },
    { ...good, lots: new Array(50).fill('a') }, { ...good, base: 1.5 }, { ...good, base: 1e300 }, { ...good, mons: 99 },
  ]) {
    const res = await send(bad);
    assert.ok([400, 422].includes(res.status), `${JSON.stringify(bad)} → ${res.status}`);
  }
  const forged = await send({ ...good, lot: 'lot-que-no-existe' });
  assert.equal(forged.status, 422);
  assert.match(forged.body.error, /solar|lot/i);
  assert.equal((await dbGame(id)).version, row.version, 'ninguna llegó a tocar la partida');
  assert.deepEqual((await dbGame(id)).state, row.state);
  assert.equal((await send(good)).status, 200, 'la buena sigue valiendo');
});

test('cleanAction: copia solo campos conocidos con valores simples', () => {
  assert.deepEqual(cleanAction({ type: 'move', base: 2, sandals: 1, bonus: true }), { type: 'move', base: 2, sandals: 1, bonus: true });
  assert.deepEqual(cleanAction(JSON.parse('{"type":"resolve","drop":["a","b"]}')), { type: 'resolve', drop: ['a', 'b'] });
  assert.throws(() => cleanAction(JSON.parse('{"type":"move","__proto__":{"x":1}}')), /Campo no permitido/);
  assert.throws(() => cleanAction({ type: 'move', base: Infinity }));
  assert.throws(() => cleanAction({ type: 'move', base: [1] }));
});

test('dos peticiones a la vez con la misma versión: una gana y la otra recibe el conflicto', async () => {
  const { id, players } = await startedGame(3);
  const row = await dbGame(id);
  const turnUser = players.find((p) => p.id === row.seats[deciderOf(row.state)].user);
  const action = chooseAction(row.state, { effort: 'fast' });
  const results = await Promise.all(Array.from({ length: 4 }, () => turnUser.b.call('POST', `/games/${id}/action`, { action, version: row.version })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409, 409, 409]);
  assert.equal((await dbGame(id)).version, row.version + 1, 'la jugada se aplicó una sola vez');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM game_actions WHERE game_id = $1', [id]))[0].n, 1);
});

test('sondeo: con la versión al día no se manda la partida', async () => {
  const { id, players } = await startedGame(3);
  const { body: full } = await players[0].b.call('GET', `/games/${id}`);
  const same = await players[0].b.call('GET', `/games/${id}?since=${full.version}`);
  assert.deepEqual(Object.keys(same.body).sort(), ['status', 'unchanged', 'version']);
  assert.ok((await players[0].b.call('GET', `/games/${id}?since=${full.version - 1}`)).body.view);
});

test('sondeo: quien no juega en la partida no averigua su versión', async () => {
  const { id, players } = await startedGame(3);
  const { body: full } = await players[0].b.call('GET', `/games/${id}`);
  const outsider = await signUp('ajeno');
  assert.equal((await outsider.b.call('GET', `/games/${id}?since=${full.version}`)).status, 403);
  assert.equal((await outsider.b.call('GET', `/games/${id}?since=${full.version - 1}`)).status, 403);
});

test('una persona y dos IA: las IA juegan solas hasta que vuelve a tocar a la persona', async () => {
  const { id, players } = await startedGame(1, 2);
  const [me] = players;
  for (let step = 0; step < 40; step++) {
    const row = await dbGame(id);
    assert.equal(row.state.players[deciderOf(row.state)].ai, false, 'la partida se detiene solo ante una persona');
    const action = chooseAction(row.state, { effort: 'fast' });
    const res = await me.b.call('POST', `/games/${id}/action`, { action, version: row.version });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.version >= row.version + 1);
  }
  const log = await db.query('SELECT seat FROM game_actions WHERE game_id = $1', [id]);
  assert.ok(new Set(log.map((l) => l.seat)).size === 3, 'el registro tiene también las jugadas de las IA');
});

// --- Ranking -----------------------------------------------------------------------------------

test('Elo: el ganador sube, el último baja, la suma es ~0 y un favorito gana menos', () => {
  const even = eloDeltas([{ rating: 1000, place: 1 }, { rating: 1000, place: 2 }, { rating: 1000, place: 3 }]);
  assert.ok(even[0] > 0 && even[2] < 0 && Math.abs(even.reduce((a, b) => a + b)) <= 1);
  const favourite = eloDeltas([{ rating: 1400, place: 1 }, { rating: 1000, place: 2 }, { rating: 1000, place: 3 }]);
  assert.ok(favourite[0] < even[0], 'ganar siendo favorito da menos');
  const upset = eloDeltas([{ rating: 1000, place: 1 }, { rating: 1400, place: 2 }, { rating: 1000, place: 3 }]);
  assert.ok(upset[0] > even[0], 'ganar al favorito da más');
  assert.deepEqual(eloDeltas([{ rating: 1000, place: 1 }]), [0]);
});

test('una partida clasificatoria completa entre tres personas termina, puntúa y mueve el ranking una sola vez', { timeout: 240_000 }, async () => {
  const { id, players } = await startedGame(3);
  assert.equal((await dbGame(id)).ranked, true);
  const byUser = new Map(players.map((p) => [p.id, p]));

  for (let step = 0; step < 4000; step++) {
    const row = await dbGame(id);
    if (row.status === 'ended') break;
    const seat = deciderOf(row.state);
    const res = await byUser.get(row.seats[seat].user).b.call('POST', `/games/${id}/action`, { action: chooseAction(row.state, { effort: 'fast' }), version: row.version });
    assert.equal(res.status, 200, `paso ${step}: ${JSON.stringify(res.body)}`);
  }
  const ended = await dbGame(id);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.settled, true);

  const results = await db.query('SELECT * FROM results WHERE game_id = $1 ORDER BY place', [id]);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.place), [1, 2, 3]);
  assert.ok(results[0].rating_after > 1000 && results[2].rating_after < 1000);
  assert.equal(results[0].user_id, ended.seats[ended.state.final.winner].user, 'gana quien dice el motor');

  const view = await players[0].b.call('GET', `/games/${id}`);
  assert.equal(view.body.results.length, 3);
  assert.equal(view.body.view.final.winner, ended.state.final.winner);

  const before = await db.query('SELECT id, rating, games, wins FROM users ORDER BY id');
  await settle(db, ended); // una segunda liquidación no cuenta otra vez
  assert.deepEqual(await db.query('SELECT id, rating, games, wins FROM users ORDER BY id'), before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM results WHERE game_id = $1', [id]))[0].n, 3);

  const board = (await browser().call('GET', '/ranking')).body.ranking;
  assert.equal(board[0].name, players.find((p) => p.id === results[0].user_id).name);
  assert.ok(board.every((r) => r.games >= 1));

  // El registro de jugadas reproduce la partida: misma semilla + mismas jugadas = mismo final.
  const log = await db.query('SELECT action FROM game_actions WHERE game_id = $1 ORDER BY seq', [id]);
  const { createGame } = await import('../src/game/setup.ts');
  let replay = createGame({ players: ended.state.players.map((p) => ({ boardId: p.boardId, ai: p.ai })), seed: ended.state.seed });
  for (const { action } of log) replay = act(replay, action);
  assert.deepEqual(replay.final, ended.state.final);
});
