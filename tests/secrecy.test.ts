import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Action, Game } from '../src/types.ts';
import { createRng, secretSeed } from '../src/game/random.ts';
import { createGame } from '../src/game/setup.ts';
import { act, legalActions } from '../src/game/engine.ts';
import { publicView, HIDDEN } from '../src/game/view.ts';
import { chooseAction, isAiTurn, deciderOf } from '../src/ai/player.ts';
import { BOARDS } from './helpers.ts';

const players = (n = 3) => BOARDS.slice(0, n).map((boardId) => ({ boardId, ai: true }));

// --- RNG de 128 bits ---------------------------------------------------------------------------

test('la semilla de 128 bits es repetible y su estado continúa la secuencia', () => {
  const seed = [1, 2, 3, 4];
  const a = createRng(seed);
  const b = createRng(seed);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);

  const rest = createRng(a.state()); // continúa donde a se quedó
  assert.deepEqual([a.next(), a.next()], [rest.next(), rest.next()]);
  assert.notDeepEqual(createRng([1, 2, 3, 5]).state(), createRng(seed).state());
});

test('la semilla de 128 bits no cambia las mezclas de la de 32 (partidas locales y tutorial)', () => {
  assert.deepEqual(createRng(7).shuffle([1, 2, 3, 4, 5, 6, 7, 8]), createRng(7).shuffle([1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(typeof createRng(7).state(), 'number');
  assert.ok(Array.isArray(createRng(secretSeed()).state()));
});

test('secretSeed da 4 enteros de 32 bits distintos cada vez y se rechazan semillas mal formadas', () => {
  const s = secretSeed();
  assert.equal(s.length, 4);
  assert.ok(s.every((n) => Number.isInteger(n) && n >= 0 && n < 2 ** 32));
  assert.notDeepEqual(secretSeed(), secretSeed());
  for (const bad of [[], [1, 2, 3], [0, 0, 0, 0], [1, 2, 3, 1.5], [1, 2, 3, 'a']]) assert.throws(() => createRng(bad as number[]), /Semilla/);
});

test('una partida con semilla de 128 bits se juega entera y es repetible', () => {
  const seed = [11, 22, 33, 44];
  const play = () => {
    let g = createGame({ players: players(), seed });
    for (let i = 0; i < 5000 && g.phase !== 'ended'; i++) g = act(g, chooseAction(g, { effort: 'fast' }));
    return g;
  };
  const g = play();
  assert.equal(g.phase, 'ended');
  assert.deepEqual(g.final, play().final);
});

// --- Vista pública -----------------------------------------------------------------------------

test('la vista pública no lleva semilla, estado del generador ni el orden de los mazos y losetas', () => {
  const g = createGame({ players: players(), seed: secretSeed() });
  const view = publicView(g);
  assert.equal(view.seed, undefined);
  assert.equal(view.rng, null);
  for (const [season, cards] of Object.entries(view.decks)) {
    assert.equal(cards.length, g.decks[season].length, 'se ve cuántas quedan');
    assert.ok(cards.every((c) => c === HIDDEN));
  }
  assert.equal(view.fireTiles.length, g.fireTiles.length);
  assert.ok(view.fireTiles.every((t) => t === HIDDEN));

  // Ningún id de carta de los mazos ocultos ni de las fichas boca abajo aparece en lo que viaja por la red.
  const wire = JSON.stringify(view);
  for (const id of Object.values(g.decks).flat()) assert.ok(!wire.includes(`"${id}"`), `${id} no debería verse`);
  for (const id of g.fireTiles) assert.ok(!wire.includes(`"${id}"`), `${id} no debería verse`);
  for (const m of Object.values(g.marketFaceDown)) for (const id of Object.values(m).flat()) assert.ok(!wire.includes(`"${id}"`), `${id} no debería verse`);
  assert.notEqual(g.rng, null, 'el original no se toca');
});

test('la vista pública conserva lo que se ve en la mesa: fila, mercado, solares y jugadores', () => {
  let g = createGame({ players: players(), seed: [5, 6, 7, 8] });
  for (let i = 0; i < 30; i++) g = act(g, chooseAction(g, { effort: 'fast' }));
  const view = publicView(g);
  for (const key of ['row', 'market', 'lots', 'players', 'buildings', 'log', 'month', 'phase', 'turn', 'fireStack']) {
    assert.deepEqual(view[key], g[key], key);
  }
  assert.deepEqual(Object.keys(view.marketFaceDown), Object.keys(g.marketFaceDown));
});

test('las jugadas dentro del turno se pueden comprobar sobre la vista pública', () => {
  let g = createGame({ players: players(), seed: secretSeed() });
  while (g.phase !== 'actions') g = act(g, chooseAction(g, { effort: 'fast' }));
  const real = legalActions(g).filter((a) => a.type !== 'endTurn');
  const seen = legalActions(publicView(g)).filter((a) => a.type !== 'endTurn');
  assert.deepEqual(seen, real);
});

// --- Entradas hostiles al motor ----------------------------------------------------------------

const GARBAGE = [undefined, null, true, false, 0, -1, 1, 2.5, 1e308, NaN, '', 'x', '__proto__', 'constructor', 'toString', [], ['a', 'a'], {}, { a: 1 }, [[]]];
const FIELDS = ['card', 'lot', 'base', 'sandals', 'bonus', 'slot', 'zone', 'pipe', 'bag', 'target', 'choice', 'building', 'buildLot', 'fish', 'lots', 'drop', 'use', 'cardType'];
const TYPES = ['placeInitial', 'placeIkizama', 'income', 'hire', 'move', 'shop', 'character', 'endTurn', 'place', 'resolve', 'start', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, 7];

/** Que el estado siga teniendo sentido: recursos enteros y no negativos, IKI entero y Kobun entre 0 y 4. */
function assertSane(g: Game) {
  for (const p of g.players) {
    for (const [res, n] of Object.entries(p.resources)) assert.ok(Number.isInteger(n) && n >= 0, `${res} = ${n}`);
    assert.ok(Number.isInteger(p.iki) && p.iki >= 0, `iki = ${p.iki}`);
    assert.ok(Number.isInteger(p.fire) && p.fire >= 0 && p.fire <= 10, `fire = ${p.fire}`);
    assert.ok(Number.isInteger(p.kobun) && p.kobun >= 0 && p.kobun <= 4, `kobun = ${p.kobun}`);
  }
}

test('acciones basura: el motor las rechaza con un error de regla o las acepta sin romper el estado', () => {
  const rng = createRng(2026);
  const pick = (list) => list[Math.floor(rng.next() * list.length)];
  let g = createGame({ players: players(4), seed: [9, 9, 9, 9] });
  let accepted = 0;
  for (let step = 0; step < 4000 && g.phase !== 'ended'; step++) {
    const hostile = { type: pick(TYPES) };
    for (const f of FIELDS) if (rng.next() < 0.25) hostile[f] = pick(GARBAGE);
    const before = JSON.stringify(g);
    try {
      const next = act(g, hostile);
      accepted += 1;
      assertSane(next);
    } catch (error) {
      // Rechazada: solo vale un error de regla (los TypeError serían un fallo del motor ante datos hostiles).
      assert.equal(error.constructor.name, 'RuleError', `${JSON.stringify(hostile)} → ${error.stack}`);
    }
    assert.equal(JSON.stringify(g), before, 'una acción rechazada o aceptada no toca el estado original');
    // Cada cierto tiempo avanza con una jugada buena para llegar a más fases.
    if (step % 3 === 0 && deciderOf(g) != null) g = act(g, chooseAction(g, { effort: 'fast' }));
  }
  assert.ok(g.month > 1, 'la partida ha avanzado');
  assert.ok(accepted >= 0);
});

test('jugadas legales con un campo manipulado: error de regla o estado coherente, nunca un fallo del motor', () => {
  const rng = createRng(77);
  const pick = (list) => list[Math.floor(rng.next() * list.length)];
  let g = createGame({ players: players(4), seed: [3, 1, 4, 1] });
  let mutated = 0;
  for (let step = 0; step < 1500 && g.phase !== 'ended'; step++) {
    for (const legal of legalActions(g).slice(0, 40)) {
      const hostile = { ...legal };
      const field = pick([...Object.keys(legal), ...FIELDS]);
      hostile[field] = pick(rng.next() < 0.5 ? GARBAGE : [...GARBAGE, ...Object.values(legal).filter((v) => v !== undefined)]);
      try {
        assertSane(act(g, hostile));
      } catch (error) {
        assert.equal(error.constructor.name, 'RuleError', `${JSON.stringify(hostile)} → ${error.stack}`);
      }
      mutated += 1;
    }
    if (deciderOf(g) == null) break;
    g = act(g, chooseAction(g, { effort: 'fast' }));
  }
  assert.ok(g.month > 6, `la partida ha avanzado (mes ${g.month})`);
  assert.ok(mutated > 1000, `se han probado ${mutated} jugadas manipuladas`);
});
