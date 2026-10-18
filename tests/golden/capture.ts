import * as M from './modules.ts';
import { hash, outcome, seeded, serialize } from './serialize.ts';
import type { Action, Game, Seed } from '../../src/types.ts';
import type { Ui } from '../../src/view/turnPanel.ts';
import type { Board } from '../../src/board.ts';

/**
 * Grabación de referencia: recorre el juego de forma determinista y anota, paso a paso, lo que hace cada capa (motor, IA,
 * lo que ve cada jugador, jugadas no válidas, tutorial, vistas y servidor). Cada escenario devuelve datos JSON; dos
 * versiones del código se comportan igual si sus escenarios dan exactamente los mismos datos.
 */

const BOARDS = ['yellow', 'blue', 'red', 'purple'];
const MAX_STEPS = 4000;

// Math.random solo lo usan la portada, el dado animado y los nombres de la IA, pero se fija por si acaso.
Math.random = seeded(1234);

const newGame = (n: number, seed: Seed, ai: (i: number) => boolean = () => true) => M.createGame({ players: BOARDS.slice(0, n).map((boardId, i) => ({ boardId, ai: ai(i) })), seed });

/** Jugadas mal formadas o imposibles que se prueban en cada paso: se anota el error exacto (o el estado, si se acepta). */
const probes = (g: Game): any[] => [
  null, undefined, {}, 'income', [], { type: 'nope' }, { type: 'constructor' }, { type: '__proto__' }, { type: 'toString' },
  { type: 'income' }, { type: 'endTurn' }, { type: 'hire', card: 'x', lot: 'y' }, { type: 'hire', card: g.row?.[0]?.card, lot: 'lot-top-left-1' },
  { type: 'move', sandals: 99 }, { type: 'move', sandals: -1 }, { type: 'move', base: 7 }, { type: 'move', base: 1.5, sandals: 0 },
  { type: 'place', zone: 'nope' }, { type: 'place', zone: 'street-1' }, { type: 'resolve' }, { type: 'resolve', drop: ['x'] },
  { type: 'resolve', cardType: 'nope' }, { type: 'resolve', use: true }, { type: 'placeIkizama', slot: '9' }, { type: 'placeIkizama', slot: '1' },
  { type: 'shop' }, { type: 'shop', choice: 'zzz' }, { type: 'shop', choice: 'build', building: 'x', lot: 'y' }, { type: 'shop', fish: 'x' },
  { type: 'character', lot: 'lot-top-left-1' }, { type: 'character', lot: 'nope' },
  { type: 'placeInitial', card: g.initialCharacters?.[0], lot: 'lot-top-left-1' }, { type: 'placeInitial', card: 'x', lot: 'y' },
];

/** Lo que se anota de un estado: cada faceta por separado, para que un fallo diga qué parte cambió. */
function facets(g: Game) {
  return {
    state: hash(g),
    whose: outcome(() => M.whoseTurn(g)),
    decider: outcome(() => [M.deciderOf(g), M.isAiTurn(g)]),
    view: outcome(() => M.publicView(g)),
    cands: outcome(() => M.candidates(g).map((a) => [serialize(a), outcome(() => M.act(g, a))])),
    legal: outcome(() => M.legalActions(g)),
    probes: hash(probes(g).map((a) => outcome(() => M.act(g, a)))),
    score: outcome(() => M.scoreGame(g)),
    stats: outcome(() => g.players.map((_, p) => M.playerStats(g, p))),
    eval: outcome(() => g.players.map((_, p) => [M.evaluate(g, p), M.evaluateAgainstOthers(g, p)])),
  };
}

/** Partida entera entre IA. `onStep(g, action)` permite a otras capas mirar cada estado. */
function playOut(g: Game, effort: 'fast' | 'normal', onStep: (g: Game, action: Action | null) => void = () => {}) {
  const steps: object[] = [];
  for (let i = 0; g.phase !== 'ended'; i++) {
    if (i >= MAX_STEPS) throw new Error('la partida no termina');
    const action = M.chooseAction(g, { effort })!;
    steps.push({ action: serialize(action), ...facets(g) });
    onStep(g, action);
    g = M.act(g, action);
  }
  onStep(g, null);
  steps.push({ action: null, ...facets(g) });
  return { steps, final: serialize(g) };
}

// --- Capas 1-3: motor, IA, vista pública y jugadas no válidas -----------------------------------

/** Escenario: nombre y función que devuelve sus datos. */
type Scenario = [string, () => unknown];

function engineScenarios() {
  const out: Scenario[] = [];
  for (const n of [3, 4]) for (let seed = 1; seed <= 20; seed++) out.push([`engine-${n}p-s${seed}-fast`, () => playOut(newGame(n, seed), 'fast')]);
  for (const [n, seed] of [[3, 101], [4, 102]]) out.push([`engine-${n}p-s${seed}-normal`, () => playOut(newGame(n, seed), 'normal')]);
  for (const [n, seed] of [[3, [1, 2, 3, 4]], [4, [0xdeadbeef, 7, 0, 99]]] as [number, number[]][]) out.push([`engine-${n}p-sfc-${seed.join('_')}`, () => playOut(newGame(n, seed), 'fast')]);
  out.push(['engine-setup', () => {
    const tries = [
      () => newGame(2, 1), () => newGame(5, 1), () => M.createGame({ players: [{ boardId: 'x' }, { boardId: 'blue' }, { boardId: 'red' }], seed: 1 }),
      () => M.createGame({ players: BOARDS.slice(0, 3).map((boardId) => ({ boardId })), seed: [0, 0, 0, 0] }),
      () => M.createGame({ players: BOARDS.slice(0, 3).map((boardId) => ({ boardId })), seed: 0 }),
      () => newGame(3, 2 ** 32 - 1), () => newGame(4, 0.5),
    ];
    const rng = (seed: Seed) => { const r = M.createRng(seed); return [r.next(), r.roll(), r.roll(20), r.shuffle([1, 2, 3, 4, 5, 6, 7, 8]), r.state()]; };
    return {
      tries: tries.map((t) => outcome(t)),
      rng: [1, 0, 2 ** 31, [1, 2, 3, 4], [5, 0, 0, 0]].map((s) => outcome(() => rng(s))),
    };
  }]);
  return out;
}

// --- Capa 4: tutorial ---------------------------------------------------------------------------

function tutorialScenario(pick: (options: Action[]) => Action) {
  return () => {
    let g = M.createTutorialGame();
    const acked = new Set<string>();
    const humanOptions = (s: Game): Action[] => (s.phase === 'initial-characters'
      ? s.initialCharacters.flatMap((card) => M.HUMAN_LOTS.map((lot) => ({ type: 'placeInitial', card, lot })))
      : M.legalActions(s));
    const steps: unknown[] = [];
    for (let i = 0; i < 6000; i++) {
      const step = M.currentStep(g, acked);
      if (!step) { steps.push('sin paso'); break; }
      const options = humanOptions(g);
      steps.push({
        id: step.id, kind: step.kind, last: Boolean(step.last), state: hash(g),
        text: [false, true].map((mobile) => outcome(() => step.text(g, { mobile }))),
        zones: outcome(() => M.stepZones(step, g)), progress: outcome(() => M.progress(g)), human: outcome(() => M.humanOf(g)),
        allows: hash(options.map((a) => outcome(() => M.stepAllows(step, g, a)))),
      });
      if (step.last) break;
      if (step.kind === 'info') acked.add(step.id);
      else if (M.isAiTurn(g) || step.kind === 'free') g = M.act(g, M.chooseAction(g, { effort: 'fast' })!);
      else {
        const allowed = options.filter((a) => M.stepAllows(step, g, a));
        g = M.act(g, step.id === 'business' ? allowed.find((a) => a.type === 'endTurn')! : pick(allowed));
      }
    }
    return { steps, ids: [M.STEPS.map((s) => s.id), M.TIPS.map((t) => t.id)], final: hash(g) };
  };
}

// --- Capa 5: vistas -----------------------------------------------------------------------------

/** Lo que el jugador tendría a medio elegir antes de la jugada `a` (el `ui` de main.js). */
function uiFor(a: any): Ui {
  if (!a) return {};
  switch (a.type) {
    case 'hire': return { hire: a.card };
    case 'move': return { base: a.base, sandals: a.sandals, bonus: a.bonus };
    case 'shop': return { pipe: a.pipe, bag: a.bag, target: a.target, building: a.building ? { via: 'shop', building: a.building } : null };
    case 'character': return { target: a.target, swapA: a.lots?.[0], swapB: a.lots?.[1], building: a.building ? { via: 'char', lot: a.lot, building: a.building } : null };
    case 'resolve': return { drop: a.drop };
    default: return {};
  }
}

function viewRecorder() {
  const el = document.createElement('div');
  const pieces = document.createElement('div');
  const board = { pieces, place: (node: HTMLElement, u: number, v: number) => { node.dataset.u = u as any; node.dataset.v = v as any; pieces.append(node); return node; } } as unknown as Board;
  const modal = M.createPlayerModal();
  const summary = M.createEventSummary();
  const finalTable = M.createFinalTable({ onNewGame() {} });
  const html = (fn: () => unknown) => outcome(() => { fn(); return el.innerHTML; });
  const steps: Record<string, string>[] = [];
  let seenLog = 0;

  return {
    steps,
    onStep(g: Game, action: Action | null) {
      const entries = g.log.slice(seenLog);
      seenLog = g.log.length;
      const variants = {
        ai: g,
        local: { ...structuredClone(g), players: g.players.map((p) => ({ ...p, ai: false })) },
        online: { ...structuredClone(g), viewer: 0, players: g.players.map((p, i) => ({ ...p, ai: i === 2 ? p.ai : false, userName: `<J${i}>` })) },
      };
      const row: Record<string, string> = { log: outcome(() => entries.map((e) => M.logLine(g, e))) };
      for (const [name, v] of Object.entries(variants)) {
        for (const [uiName, ui] of [['empty', {}], ['next', uiFor(action)], ['error', { error: 'Algo falla' }]] as [string, Ui][]) {
          const ctx = { ui, set() {}, dispatch() {}, undo() {}, canUndo: uiName === 'empty' };
          row[`${name}.turn.${uiName}`] = html(() => M.renderTurnPanel(el, v, ctx));
          row[`${name}.targets.${uiName}`] = outcome(() => M.boardTargets(v, ctx).map(({ zone, title }) => [zone, title]));
        }
        const hireable = (() => { try { return M.hireableCards(v); } catch { return new Set<string>(); } })();
        row[`${name}.hireable`] = outcome(() => M.hireableCards(v));
        row[`${name}.decks`] = html(() => M.renderDecks(el, v, { selectedCard: v.row?.[0]?.card ?? null, onSelectCard() {}, hireable, hiring: uiFor(action).hire ?? null, onSelectHire() {} }));
        row[`${name}.supply`] = html(() => M.renderSupply(el, v));
        row[`${name}.players`] = html(() => M.renderPlayers(el, v, { onOpenBoard() {} }));
        row[`${name}.pieces`] = outcome(() => {
          const targets = (() => { try { return M.boardTargets(v, { ui: uiFor(action), dispatch() {} }); } catch { return []; } })();
          M.renderBoardPieces(board, v, { targets, fireNagaya: null });
          return pieces.innerHTML;
        });
        row[`${name}.modal`] = outcome(() => v.players.map((_, i) => { modal.open(v, i); return document.getElementById('player-modal')!.innerHTML; }));
      }
      if (entries.length) row.summary = outcome(() => [summary.show(g, entries), document.getElementById('event-summary')!.innerHTML]);
      if (g.phase === 'ended') row.final = outcome(() => { finalTable.open(g); return document.getElementById('final-table')!.innerHTML; });
      steps.push(row);
    },
  };
}

function viewScenarios() {
  const out: Scenario[] = [];
  for (const [n, seed] of [[3, 1], [4, 2], [3, 3], [4, 4]]) {
    out.push([`view-${n}p-s${seed}`, () => {
      const rec = viewRecorder();
      playOut(newGame(n, seed), 'fast', rec.onStep);
      return { steps: rec.steps };
    }]);
  }
  out.push(['view-static', () => {
    const el = document.createElement('div');
    M.renderSpecialsInfo(el);
    return {
      specials: hash(el.innerHTML),
      abilities: M.CHARACTERS.map((c) => [c.id, outcome(() => M.abilityText(c)), outcome(() => M.cardSummary((c as { image?: string }).image!))]),
    };
  }]);
  out.push(['data', () => Object.fromEntries(Object.entries(M.data).map(([name, mod]) => [name, hash(mod)]))]);
  return out;
}

// --- Capa 6: servidor ---------------------------------------------------------------------------

async function serverScenario() {
  // La semilla secreta de las partidas sale de crypto.getRandomValues: se fija para que los mazos salgan siempre igual.
  const fixed = seeded(99);
  const original = globalThis.crypto.getRandomValues;
  Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, value: (arr: Uint32Array) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(fixed() * 2 ** 32); return arr; } });
  const quiet = console.error;
  console.error = () => {};

  const db = await M.localDb();
  let clock = Date.parse('2026-10-17T10:00:00Z');
  const app = M.createApp({ db, secret: 's'.repeat(40), now: () => clock });
  const ORIGIN = 'http://iki.test';
  const transcript: string[] = [];
  // Ids de partida (node:crypto) y fechas de la base de datos cambian en cada ejecución: se sustituyen por marcadores.
  const ids = new Map();
  const norm = (text: string) => text
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)?/g, 'FECHA')
    .replace(/[A-Za-z0-9_-]{8}(?=["/?\s]|$)/g, (m) => (ids.has(m) ? ids.get(m)! : m));

  function browser() {
    let cookie = '';
    return async (method: string, path: string, body?: unknown, { origin = ORIGIN, type = 'application/json' } = {}) => {
      const headers = new Headers();
      if (cookie) headers.set('cookie', cookie);
      if (origin) headers.set('origin', origin);
      if (body !== undefined) headers.set('content-type', type);
      const res = await app.handle(new Request(`${ORIGIN}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      const parsed = (() => { try { return JSON.parse(text); } catch { return text; } })();
      if (parsed?.id && typeof parsed.id === 'string' && !ids.has(parsed.id)) ids.set(parsed.id, `ID${ids.size}`);
      const line = norm(`${method} ${path} ${body === undefined ? '' : serialize(body)} → ${res.status} ${set ?? ''} ${text}`);
      transcript.push(line.length > 400 ? `${line.slice(0, 300)}… #${hash(line)}` : line); // las partidas enteras, por huella
      return { status: res.status, body: parsed };
    };
  }
  const dbGame = async (id: string) => (await db.query('SELECT * FROM games WHERE id = $1', [id]))[0];

  try {
    const [a, b, c, d] = [browser(), browser(), browser(), browser()];
    await a('POST', '/register', { name: 'ana', password: 'contraseña-larga' });
    await b('POST', '/register', { name: 'beto', password: 'contraseña-larga' });
    await c('POST', '/register', { name: 'cris', password: 'contraseña-larga' });
    await d('POST', '/register', { name: 'dani', password: 'contraseña-larga' });
    await d('POST', '/register', { name: 'ana', password: 'otra-contraseña' });
    await d('POST', '/register', { name: 'x', password: '1' });
    await d('POST', '/register', { name: '<script>', password: 'contraseña-larga' });
    await d('POST', '/logout', {});
    for (let i = 0; i < 6; i++) await d('POST', '/login', { name: 'dani', password: 'mala-contraseña' });
    clock += 16 * 60_000;
    await d('POST', '/login', { name: 'nadie', password: 'contraseña-larga' });
    await d('POST', '/login', { name: 'dani', password: 'contraseña-larga' });
    await d('POST', '/logout', {});
    await d('GET', '/games');
    await a('GET', '/me');
    await a('POST', '/games', { size: 3 }, { origin: 'http://evil.test' });
    await a('POST', '/games', { size: 3 }, { type: 'text/plain' });
    await a('POST', '/games', { size: 9 });
    await a('PUT', '/games', {});
    await a('GET', '/no-existe');

    // Partida de tres personas, entera.
    const { body: room } = await a('POST', '/games', { size: 3 });
    await b('POST', `/games/${room.id}/join`, {});
    await b('POST', `/games/${room.id}/start`, {});
    await c('POST', `/games/${room.id}/join`, {});
    await a('GET', '/games');
    await a('POST', `/games/${room.id}/start`, {});
    const seats = { a, b, c };
    const users = Object.fromEntries(await Promise.all(Object.entries({ a: 'ana', b: 'beto', c: 'cris' }).map(async ([k, name]) => [(await db.query('SELECT id FROM users WHERE name = $1', [name]))[0].id, seats[k as keyof typeof seats]])));
    for (let i = 0; i < MAX_STEPS; i++) {
      const row = await dbGame(room.id);
      if (!row) throw new Error(transcript.slice(-8).join("\n"));
      if (row.status !== 'playing') break;
      const who = users[row.seats[M.deciderOf(row.state)!].user];
      const action = M.chooseAction(row.state, { effort: 'fast' });
      if (i % 25 === 0) {
        await who('POST', `/games/${room.id}/action`, { action: { ...action, hack: 1 }, version: row.version });
        await who('POST', `/games/${room.id}/action`, { action, version: row.version - 1 });
        await (who === a ? b : a)('POST', `/games/${room.id}/action`, { action, version: row.version });
        await who('GET', `/games/${room.id}?since=${row.version}`);
      }
      await who('POST', `/games/${room.id}/action`, { action, version: row.version });
      clock += 1000;
    }
    await a('GET', `/games/${room.id}`);
    await a('GET', '/ranking');

    // Sala con IA: el servidor juega por ellas hasta que le toca a una persona.
    const { body: mixed } = await b('POST', '/games', { size: 4 });
    await b('POST', `/games/${mixed.id}/ai`, { add: true });
    await b('POST', `/games/${mixed.id}/ai`, { add: true });
    await c('POST', `/games/${mixed.id}/join`, {});
    await b('POST', `/games/${mixed.id}/start`, {});
    for (let i = 0; i < 30; i++) {
      const row = await dbGame(mixed.id);
      if (!row) throw new Error(transcript.slice(-8).join("\n"));
      if (row.status !== 'playing') break;
      const who = users[row.seats[M.deciderOf(row.state)!].user];
      await who('POST', `/games/${mixed.id}/action`, { action: M.chooseAction(row.state, { effort: 'fast' }), version: row.version });
    }
    await c('POST', `/games/${mixed.id}/leave`, {});
    await b('GET', `/games/${mixed.id}`);

    const clean = [null, [], { type: 'hire', card: 'x', lot: 'y', hack: 1 }, { type: 'move', base: 1.5 }, { type: 'resolve', drop: new Array(50).fill('a') }]
      .map((x) => outcome(() => M.cleanAction(x)));
    const elo = outcome(() => [M.eloDeltas([{ rating: 1000, place: 1 }, { rating: 1200, place: 2 }, { rating: 900, place: 3 }])]);
    return { transcript, clean, elo };
  } finally {
    await db.close();
    console.error = quiet;
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, value: original });
  }
}

/** Todos los escenarios: [nombre, () => datos | Promise<datos>]. */
export const scenarios = (): Scenario[] => [
  ...engineScenarios(),
  ['tutorial-first', tutorialScenario((options) => options[0])],
  ['tutorial-last', tutorialScenario((options) => options.at(-1)!)],
  ...viewScenarios(),
  ['server', serverScenario],
];
