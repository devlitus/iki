import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Action, Game } from '../src/types.ts';
import { newGame, tweak } from './helpers.ts';
import { act, legalActions, whoseTurn } from '../src/game/engine.ts';
import { createRng } from '../src/game/random.ts';
import { scorePlayer, scoreGame } from '../src/game/scoring.ts';
import { KOBUN_PER_PLAYER } from '../src/game/setup.ts';
import { startEvent } from '../src/game/events.ts';

// --- Puntuación --------------------------------------------------------------------------------

/** Jugador 0 = Paula del ejemplo de la p. 11 (100 IKI). */
function paula() {
  return tweak(newGame(), (d) => {
    d.lots = {};
    const p = d.players[0];
    p.iki = 28;
    // 3 Vendedores (el tipo más contratado), 1 Artesano, 1 Comerciante y el Marionetista retirado, que es del tipo «constructor».
    p.retired = ['book-seller', 'sake-seller', 'soap-bubble-maker', 'dice-maker', 'dyer', 'puppeteer'];
    p.specials = ['wild'];
    p.wildType = 'builder';
    p.fish = ['spring-fish-4', 'summer-fish-7', 'autumn-fish-2']; // 3 estaciones: 10 + 1 + 7
    p.pipes = ['spring-fire-2'];
    p.tobacco = ['autumn-inro-3', 'winter-bag-7']; // 3 (tipo más contratado) + 5
    p.buildings = ['restaurant'];
    p.resources = { mon: 5, rice: 0, sandal: 0, wood: 0, koban: 1 };
  });
}

test('ejemplo de puntuación de Paula (p. 11): 100 IKI', () => {
  const s = scorePlayer(paula(), 0);
  assert.deepEqual(s, { track: 28, variety: 16, fish: 18, tobacco: 16, buildings: 18, resources: 4, total: 100 });
});

test('el Comodín cambia el tipo del Marionetista; sin él cuenta como Especial', () => {
  const g = tweak(paula(), (d) => {
    d.players[0].wildType = undefined;
    d.players[0].retired = d.players[0].retired.filter((c) => c !== 'dice-maker'); // vendedor ×3, comerciante, especial
  });
  assert.equal(scorePlayer(g, 0).variety, 9);
  const wild = tweak(g, (d) => (d.players[0].wildType = 'merchant'));
  assert.equal(scorePlayer(wild, 0).variety, 4);
});

test('variedad, pescado y recursos según las tablas', () => {
  const g = tweak(newGame(), (d) => {
    d.lots = {};
    const p = d.players[0];
    p.retired = ['book-seller'];
    p.fish = ['spring-fish-2'];
    p.resources = { mon: 11, rice: 4, sandal: 4, wood: 2, koban: 2 };
  });
  assert.deepEqual(scorePlayer(g, 0), { track: 0, variety: 1, fish: 3, tobacco: 0, buildings: 0, resources: 6 + 2 + 2, total: 1 + 3 + 10 });
});

test('bolsas de Tabaco: sin pipa no se doblan; cada fórmula', () => {
  const g = tweak(newGame(), (d) => {
    d.lots = {};
    const p = d.players[0];
    p.fire = 7;
    p.retired = ['book-seller', 'sake-seller', 'dice-maker'];
    p.resources.mon = 9;
    p.tobacco = ['summer-fire-5', 'autumn-inro-5', 'winter-owl-1', 'spring-box-4'];
  });
  // 1 por cada 2 de Extinción = 3 · 2 tipos distintos = 2 · 9 mons / 4 = 2 · 3 IKI
  assert.equal(scorePlayer(g, 0).tobacco, 3 + 2 + 2 + 3);
  const withPipe = tweak(g, (d) => (d.players[0].pipes = ['spring-fire-2']));
  assert.equal(scorePlayer(withPipe, 0).tobacco, 2 * (3 + 2 + 2 + 3));
});

test('edificios: fijos y variables, con sus máximos', () => {
  const g = tweak(newGame(), (d) => {
    d.lots = {};
    const p = d.players[0];
    p.fire = 6;
    p.fish = ['summer-fish-7'];
    p.buildings = ['kabuki-theater', 'tavern', 'trading-house', 'warehouse', 'well', 'restaurant'];
    p.resources = { mon: 0, rice: 9, sandal: 12, wood: 0, koban: 0 };
  });
  // 26 + 12 + min(30, 36) + min(32, 36) + 2×6 + (3 + 7)
  assert.equal(scorePlayer(g, 0).buildings, 26 + 12 + 30 + 32 + 12 + 10);
});

test('desempate: más IKI, luego más Extinción, luego más arriba en la pila', () => {
  const g = tweak(newGame(), (d) => {
    d.lots = {};
    d.players.forEach((p) => (p.iki = 10));
    d.players[2].fire = 4;
    d.players[0].fire = 1;
    d.players[1].fire = 1;
    d.fireStack = [2, 1, 0];
  });
  assert.deepEqual(scoreGame(g).ranking, [2, 1, 0]);
  const more = tweak(g, (d) => (d.players[0].iki = 11));
  assert.equal(scoreGame(more).winner, 0);
});

// --- Día de Año Nuevo --------------------------------------------------------------------------

/** Final del mes 12 resuelto: empieza el mes 13. */
function newYear(edit: (d: Game) => unknown = () => {}) {
  return tweak(newGame(), (d) => {
    d.month = 12;
    d.lots = {};
    d.players.forEach((p) => (p.kobun = KOBUN_PER_PLAYER));
    d.fireStack = [1, 2, 0];
    edit(d);
    startEvent(d);
  });
}

test('mes 13: juegan por orden de Extinción, sin mover ni contratar', () => {
  let g = newYear();
  assert.equal(g.phase, 'newyear');
  assert.equal(g.month, 13);
  assert.equal(whoseTurn(g), 1);
  assert.equal(g.turn.step, 'place');
  assert.throws(() => act(g, { type: 'income' }), /toca/);
  assert.throws(() => act(g, { type: 'move' }), /toca/);
  assert.throws(() => act(g, { type: 'shop' }), /toca/);
  assert.throws(() => act(g, { type: 'place', zone: 'queue-1' }), /calle/);
  g = act(g, { type: 'place', zone: 'street-b3' });
  assert.equal(g.players[1].oyakata, 'street-b3');
  assert.equal(g.turn.step, 'business');
  assert.equal(legalActions(g).some((a) => a.type === 'place'), false);
});

test('mes 13: negocios con la tienda y con un personaje ajeno, que gana experiencia y puede retirarse', () => {
  let g = newYear((d) => {
    d.lots['lot-bottom-right-1'] = { kind: 'character', card: 'incense-shop', owner: 0, xp: 1 }; // puesto de la Casa de Empeños
    d.players[0].kobun -= 1;
    d.players[1].resources = { mon: 3, rice: 0, sandal: 1, wood: 0, koban: 0 };
  });
  g = act(g, { type: 'place', zone: 'street-b3' });
  g = act(g, { type: 'shop', choice: 'sandal' });
  assert.equal(g.players[1].resources.mon, 7);
  g = act(g, { type: 'character', lot: 'lot-bottom-right-1' }); // 3 mons → 5 IKI
  assert.equal(g.players[1].iki, 5);
  assert.equal(g.lots['lot-bottom-right-1'], undefined, 'xp 1 → 2: la Tienda de Incienso se retira');
  assert.deepEqual(g.players[0].retired, ['incense-shop']);
  g = act(g, { type: 'endTurn' });
  assert.equal(whoseTurn(g), 2);
});

test('al terminar el último turno se recogen las cartas y se puntúa', () => {
  let g = newYear((d) => {
    d.lots['lot-top-left-1'] = { kind: 'character', card: 'dyer', owner: 0, xp: 0 };
    d.lots['lot-top-left-2'] = { kind: 'building', card: 'tavern', owner: 0, xp: 0 };
    d.players[0].buildings = ['tavern'];
    d.players[0].kobun -= 2;
  });
  for (let i = 0; i < 3; i++) g = act(act(g, { type: 'place', zone: 'street-t1' }), { type: 'endTurn' });
  assert.equal(g.phase, 'ended');
  assert.equal(g.turn, null);
  assert.equal(g.pending, null);
  assert.deepEqual(g.players[0].retired, ['dyer'], 'el personaje del tablero se recoge');
  assert.ok(g.lots['lot-top-left-2'], 'el edificio sigue en su solar');
  assert.equal(g.final.scores[0].total, 12 + 1 + 2, 'Taberna + 1 tipo de personaje + 8 mons iniciales');
  assert.equal(g.final.winner, 0);
  assert.deepEqual(legalActions(g), []);
  assert.throws(() => act(g, { type: 'endTurn' }), /Ahora no/);
});

test('Comodín: al final se pregunta el tipo del Marionetista y cuenta en la puntuación', () => {
  let g = newYear((d) => {
    d.players[1].retired = ['puppeteer', 'book-seller'];
    d.players[1].specials = ['wild'];
  });
  for (let i = 0; i < 3; i++) g = act(act(g, { type: 'place', zone: 'street-t1' }), { type: 'endTurn' });
  assert.equal(g.phase, 'newyear', 'aún no se ha puntuado');
  assert.deepEqual(g.pending, { type: 'wildType', player: 1 });
  assert.equal(whoseTurn(g), 1);
  assert.equal(legalActions(g).length, 5);
  assert.throws(() => act(g, { type: 'resolve', cardType: 'ninja' } as any), /tipo/);
  for (const cardType of ['constructor', '__proto__', 'toString']) assert.throws(() => act(g, { type: 'resolve', cardType } as any), /tipo/, cardType);
  g = act(g, { type: 'resolve', cardType: 'artisan' });
  assert.equal(g.phase, 'ended');
  assert.equal(g.players[1].wildType, 'artisan');
  assert.equal(g.final.scores[1].variety, 4); // vendedor + artesano
});

// --- Partidas completas ------------------------------------------------------------------------

test('partidas al azar completas: terminan con puntuación y un ganador', () => {
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const rng = createRng(seed);
    let g = newGame(3 + (seed % 2), seed);
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 30000) {
      const options = legalActions(g);
      assert.ok(options.length > 0, `sin jugadas en ${g.phase} (semilla ${seed})`);
      g = act(g, options[Math.floor(rng.next() * options.length)]);
    }
    assert.equal(g.phase, 'ended', `la semilla ${seed} no terminó`);
    assert.equal(g.final.ranking.length, g.players.length);
    assert.ok(g.final.scores.every((s) => Number.isInteger(s.total) && s.total >= 0));
    assert.equal(g.final.winner, g.final.ranking[0]);
    assert.equal(Object.values(g.lots).filter((l) => l.kind === 'character').length, 0);
    g.players.forEach((p, i) => assert.equal(p.kobun + Object.values(g.lots).filter((l) => l.owner === i).length, KOBUN_PER_PLAYER));
  }
});
