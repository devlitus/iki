import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tweak } from './helpers.js';
import { act, legalActions, whoseTurn } from '../src/game/engine.js';
import { startEvent, continueEvent, harmonyBonus, FIRE_STRENGTH } from '../src/game/events.js';
import { KOBUN_PER_PLAYER, OUTER_LOTS } from '../src/game/setup.js';

/** Estado al final de la fase B del `month`, con ajustes, y resuelve el Evento. */
function eventOf(month, edit = () => {}) {
  return tweak(newGame(), (d) => {
    d.month = month;
    d.lots = {}; // sin personajes iniciales, para controlar el tablero
    d.players.forEach((p) => (p.kobun = KOBUN_PER_PLAYER));
    edit(d);
    startEvent(d);
  });
}

const put = (d, lot, owner, card, xp = 0) => {
  d.lots[lot] = { kind: card.startsWith('b:') ? 'building' : 'character', card: card.replace('b:', ''), owner, xp };
  d.players[owner].kobun -= 1;
};

// --- Eventos simples ---------------------------------------------------------------------------

test('meses 1, 2, 4, 7 y 10: +1 mon en cada carta de la fila y empieza el mes siguiente', () => {
  for (const month of [1, 2, 4, 7, 10]) {
    const g = eventOf(month, (d) => (d.row = [{ card: 'monk', mons: 0 }, { card: 'dyer', mons: 2 }]));
    assert.equal(g.month, month + 1);
    assert.equal(g.phase, 'ikizama');
    assert.deepEqual(g.row.slice(0, 2).map((r) => r.mons), [1, 3], `mes ${month}`);
  }
});

// --- Día de Pago -------------------------------------------------------------------------------

test('salario: casilla de experiencia de cada personaje y máximo de los retirados', () => {
  const g = eventOf(3, (d) => {
    put(d, 'lot-top-left-1', 0, 'seamstress', 2); // 3 IKI
    put(d, 'lot-top-left-2', 0, 'dyer', 1); // 3 mons
    d.players[0].retired.push('cotton-seller'); // 1 mon + 1 sandalia
    d.players[0].resources = { mon: 0, rice: 5, sandal: 0, wood: 0, koban: 0 };
  });
  const p = g.players[0];
  assert.equal(p.iki, 3);
  assert.deepEqual([p.resources.mon, p.resources.sandal], [4, 1]);
});

test('salario negativo del Jornalero: el IKI nunca baja de 0', () => {
  const g = eventOf(6, (d) => {
    put(d, 'lot-top-left-1', 0, 'day-laborer', 0); // −2 IKI
    d.players[0].resources.rice = 5;
  });
  assert.equal(g.players[0].iki, 0);
  const rich = eventOf(6, (d) => {
    put(d, 'lot-top-left-1', 0, 'day-laborer', 0);
    d.players[0].resources.rice = 5;
    d.players[0].iki = 5;
  });
  assert.equal(rich.players[0].iki, 3);
});

test('Armonía: cada jugador cobra (sus cartas del tipo) × (cartas del tipo en el grupo), y las esquinas puntúan dos veces', () => {
  const g = tweak(newGame(), (d) => {
    d.lots = {};
    put(d, 'lot-bottom-left-1', 0, 'seamstress'); // Nagaya SO: dos artesanos de 0 → 2×2
    put(d, 'lot-bottom-left-2', 0, 'dice-maker');
    put(d, 'lot-top-left-4', 0, 'sandal-maker'); // esquina (grupo 5) y su Nagaya, sola
    put(d, 'lot-top-right-1', 1, 'seamstress'); // esquinas: 3 artesanos en total
    put(d, 'lot-bottom-right-1', 1, 'dyer'); // esquina de comerciante, sin pareja en el grupo 5
    put(d, 'lot-bottom-right-2', 2, 'carpenter'); // Nagaya SE: constructor + comerciante + constructor
    put(d, 'lot-bottom-right-3', 1, 'carpenter');
    harmonyBonus(d);
  });
  // SO: p0 2×2 = 4. Esquinas: artesanos p0 1 (top-left-4), p1 1 (top-right-1), total 2 → 1×2 cada uno.
  // SE: constructores p2 y p1 → 1×2 cada uno.
  assert.deepEqual(g.players.map((p) => p.iki), [4 + 2, 2 + 2, 2]);
});

test('comida: 1 arroz por personaje en el tablero; los retirados y los edificios no comen', () => {
  const g = eventOf(3, (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer');
    put(d, 'lot-top-left-2', 0, 'b:tavern');
    d.players[0].retired.push('cotton-seller');
    d.players[0].resources.rice = 3;
  });
  assert.equal(g.players[0].resources.rice, 2);
  assert.equal(g.pending, null);
});

test('comida insuficiente con arroz: el jugador elige a quién eliminar y recupera su Kobun', () => {
  let g = eventOf(3, (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer');
    put(d, 'lot-top-left-2', 0, 'yamabushi');
    put(d, 'lot-top-left-3', 0, 'monk');
    d.players[0].resources.rice = 2;
  });
  assert.deepEqual(g.pending, { type: 'food', player: 0, drop: 1 });
  assert.equal(g.phase, 'event');
  assert.equal(whoseTurn(g), 0);
  assert.equal(g.players[0].resources.rice, 2, 'aún no ha pagado');
  assert.throws(() => act(g, { type: 'resolve', drop: [] }), /Elige 1/);
  assert.throws(() => act(g, { type: 'resolve', drop: ['lot-top-left-4'] }), /Elige 1/);
  assert.equal(legalActions(g).length, 3);
  g = act(g, { type: 'resolve', drop: ['lot-top-left-2'] });
  assert.equal(g.lots['lot-top-left-2'], undefined);
  assert.equal(g.players[0].kobun, KOBUN_PER_PLAYER - 2);
  assert.equal(g.players[0].resources.rice, 0);
  assert.equal(g.month, 4, 'el Evento continúa y acaba');
  assert.equal(g.phase, 'ikizama');
});

test('comida sin nada de arroz: caen todos sin preguntar; la bonificación de fuego se conserva', () => {
  const g = eventOf(3, (d) => {
    put(d, 'lot-top-left-1', 0, 'monk');
    put(d, 'lot-top-left-2', 0, 'dyer');
    d.players[0].resources.rice = 0;
    d.players[0].fire = 3;
  });
  assert.equal(g.pending, null);
  assert.deepEqual(Object.keys(g.lots), []);
  assert.equal(g.players[0].fire, 3);
  assert.equal(g.players[0].kobun, KOBUN_PER_PLAYER);
});

test('varios jugadores sin arroz: se pregunta a cada uno por orden de turno', () => {
  let g = eventOf(3, (d) => {
    for (const p of [0, 1]) {
      put(d, `lot-top-left-${p * 2 + 1}`, p, 'dyer');
      put(d, `lot-top-left-${p * 2 + 2}`, p, 'monk');
      d.players[p].resources.rice = 1;
    }
    d.turnOrder = [1, 0, 2];
  });
  assert.equal(g.pending.player, 1);
  g = act(g, { type: 'resolve', drop: ['lot-top-left-3'] });
  assert.equal(g.pending.player, 0);
  g = act(g, { type: 'resolve', drop: ['lot-top-left-1'] });
  assert.equal(g.pending, null);
});

test('Granja y Villa Imperial: IKI por Kobun alimentado y mons por personaje del tipo más contratado', () => {
  const g = eventOf(3, (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer'); // comerciante
    put(d, 'lot-top-left-2', 0, 'soba-stall'); // comerciante
    d.players[0].retired.push('dice-maker'); // artesano
    d.players[0].buildings.push('farm', 'imperial-villa');
    d.players[0].resources.rice = 5;
  });
  // Salarios: Tintorero 2 mons (xp 0) + Puesto de Soba 2 mons + retirado Dados 3 IKI; Armonía: 2 comerciantes juntos 2×2 = 4 IKI;
  // Granja 2×2 = 4 IKI; Villa 2×2 = 4 mons.
  assert.equal(g.players[0].iki, 3 + 4 + 4);
  assert.equal(g.players[0].resources.mon, 8 + 2 + 2 + 4);
  assert.equal(g.players[0].fed, undefined);
});

test('cambio de estación: fila y mercado fuera; llega el mercado de la siguiente', () => {
  const before = newGame();
  const g = eventOf(3, (d) => (d.row = [{ card: 'monk', mons: 3 }]));
  assert.deepEqual(g.market, before.marketFaceDown.summer);
  assert.equal(g.marketFaceDown.summer, undefined);
  assert.equal(g.row.length, 4, 'las 4 cartas nuevas del mes 4');
  assert.ok(!g.row.some((r) => r.card === 'monk'));
});

test('mes 12: el mercado de Invierno se queda, se recogen los Oyakata y llega el Año Nuevo', () => {
  const g = eventOf(12, (d) => {
    d.market = d.marketFaceDown.winter;
    d.marketFaceDown = {};
    d.row = [{ card: 'samurai', mons: 1 }];
    d.fireStack = [2, 0, 1];
  });
  assert.equal(g.phase, 'newyear');
  assert.equal(g.month, 13);
  assert.deepEqual(g.market.fish, ['winter-fish-2', 'winter-fish-9']);
  assert.deepEqual(g.row, []);
  assert.ok(g.players.every((p) => p.oyakata === null));
  assert.deepEqual(g.order, [2, 0, 1], 'juega primero el más adelantado en Extinción');
});

// --- Incendio ----------------------------------------------------------------------------------

/** Incendio en un Nagaya concreto, saltando el sorteo de la loseta. */
function burning(month, nagaya, edit) {
  return tweak(newGame(), (d) => {
    d.month = month;
    d.lots = {};
    d.players.forEach((p) => (p.kobun = KOBUN_PER_PLAYER));
    edit(d);
    d.phase = 'event';
    d.event = { kind: 'fire', stage: 'spread', nagaya, index: 0, tile: null };
    continueEvent(d);
  });
}

test('incendio (ejemplo p. 9): quema al primero, cruza un solar vacío y lo frena quien tiene Extinción suficiente', () => {
  const g = burning(5, 'top-left', (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer'); // fuerza 5 > 0: arde
    put(d, 'lot-top-left-3', 1, 'monk'); // fuerza 3 ≤ 3: frena
    put(d, 'lot-top-left-4', 2, 'dyer'); // se salva
    d.players[1].fire = 3;
    d.row = [{ card: 'sake-seller', mons: 0 }];
  });
  assert.equal(g.lots['lot-top-left-1'], undefined);
  assert.equal(g.players[0].kobun, KOBUN_PER_PLAYER);
  assert.ok(g.lots['lot-top-left-3'] && g.lots['lot-top-left-4']);
  assert.equal(g.players[0].retired.length, 0, 'la carta quemada sale de la partida');
  assert.equal(g.month, 6);
  assert.equal(g.row[0].mons, 1, '+1 mon en la fila después del incendio');
});

test('incendio: la fuerza baja 1 por solar y si nadie lo frena llega hasta el final del Nagaya', () => {
  const g = burning(8, 'bottom-right', (d) => {
    put(d, 'lot-bottom-right-4', 0, 'dyer');
    put(d, 'lot-bottom-right-3', 1, 'dyer');
    put(d, 'lot-bottom-right-2', 2, 'dyer');
    put(d, 'lot-bottom-right-1', 0, 'dyer');
    d.players[0].fire = 5; // fuerza 8, 7, 6, 5 → en el último solar 5 ≥ 5 frena
    d.players[1].fire = 6; // 7 > 6: arde
    d.players[2].fire = 6; // 6 ≤ 6 frena aquí
  });
  assert.equal(g.lots['lot-bottom-right-4'], undefined, 'fuerza 8 > 5');
  assert.equal(g.lots['lot-bottom-right-3'], undefined, 'fuerza 7 > 6');
  assert.ok(g.lots['lot-bottom-right-2'], 'fuerza 6 ≤ 6');
  assert.ok(g.lots['lot-bottom-right-1']);
});

test('incendio: los edificios arden o frenan como los personajes', () => {
  const burns = burning(5, 'top-right', (d) => put(d, 'lot-top-right-4', 0, 'b:tavern'));
  assert.equal(burns.lots['lot-top-right-4'], undefined);
  assert.deepEqual(burns.players[0].buildings, []);
  assert.equal(burns.players[0].kobun, KOBUN_PER_PLAYER);
});

test('Evitar un incendio: el dueño decide, la ficha se gasta y el fuego sigue', () => {
  const setup = (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer');
    put(d, 'lot-top-left-2', 1, 'dyer');
    d.players[0].specials.push('avoid-fire', 'avoid-fire');
  };
  let g = burning(5, 'top-left', setup);
  assert.deepEqual(g.pending, { type: 'avoidFire', player: 0, lot: 'lot-top-left-1' });
  assert.equal(whoseTurn(g), 0);
  const used = act(g, { type: 'resolve', use: true });
  assert.ok(used.lots['lot-top-left-1'], 'el personaje se salva');
  assert.deepEqual(used.players[0].specials, ['avoid-fire'], 'se gasta una ficha');
  assert.equal(used.lots['lot-top-left-2'], undefined, 'el incendio sigue');
  const declined = act(g, { type: 'resolve', use: false });
  assert.equal(declined.lots['lot-top-left-1'], undefined);
  assert.equal(declined.players[0].specials.length, 2);
  assert.throws(() => act(g, { type: 'resolve' }), /Elige/);
  assert.throws(() => act(g, { type: 'income' }), /Ahora no/);
});

test('Evitar un incendio no protege edificios ni se ofrece si el personaje ya está a salvo', () => {
  const g = burning(5, 'top-left', (d) => {
    put(d, 'lot-top-left-1', 0, 'b:tavern');
    d.players[0].specials.push('avoid-fire');
  });
  assert.equal(g.pending, null);
  assert.equal(g.lots['lot-top-left-1'], undefined);
  const safe = burning(5, 'top-left', (d) => {
    put(d, 'lot-top-left-1', 0, 'dyer');
    d.players[0].specials.push('avoid-fire');
    d.players[0].fire = 5;
  });
  assert.equal(safe.pending, null);
  assert.deepEqual(safe.players[0].specials, ['avoid-fire']);
});

test('el Evento de incendio sortea una loseta, la devuelve a la pila y avanza el generador', () => {
  const g = eventOf(5, (d) => {});
  assert.equal(g.fireTiles.length, 4);
  assert.deepEqual([...g.fireTiles].sort(), [...OUTER_LOTS].sort());
  const same = eventOf(5, (d) => {});
  assert.deepEqual(same.fireTiles, g.fireTiles, 'con la misma semilla sale lo mismo');
  assert.notEqual(g.rng, newGame().rng);
  assert.ok(g.log.some((e) => e.type === 'fire-start' && e.strength === FIRE_STRENGTH[5]));
});
