import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Action, Game } from '../src/types.ts';
import { OUTER_LOTS, KOBUN_PER_PLAYER, createGame, currentPicker } from '../src/game/setup.ts';
import { newGame, tweak, placeAll, turnOf } from './helpers.ts';
import { createRng } from '../src/game/random.ts';
import { act, legalActions, whoseTurn } from '../src/game/engine.ts';
import { CHARACTERS_BY_ID } from '../src/data/characters.ts';
import { ZONES_BY_ID } from '../src/data/zones.ts';
import { logLine } from '../src/view/format.ts';
import { playerStats } from '../src/game/playerStats.ts';

// --- Ayudas ------------------------------------------------------------------------------------

const player = (g: Game, slot = g.turn!.slot) => g.players[g.turn!.player];
const throws = (fn: () => unknown, re: RegExp) => assert.throws(fn, re);

// --- Preparación y fase A ----------------------------------------------------------------------

test('al colocar el último personaje inicial empieza el mes 1 con 4 cartas', () => {
  const g = newGame();
  assert.equal(g.phase, 'ikizama');
  assert.equal(g.month, 1);
  assert.equal(g.row.length, 4);
  assert.ok(g.row.every((r) => r.mons === 0));
  assert.deepEqual(g.order, g.fireStack);
  assert.equal(g.decks.spring.length, 10);
  for (const r of g.row) assert.equal(CHARACTERS_BY_ID[r.card].season, 'spring');
});

test('el ganador de los dados elige primero personaje inicial y coloca primero su Ikizama en el mes 1', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = createGame({ players: ['yellow', 'blue', 'red', 'purple'].map((boardId) => ({ boardId })), seed });
    const { starter, turnOrder } = g;
    assert.equal(currentPicker(g), starter);
    assert.deepEqual(g.pickOrder, [starter, ...turnOrder.slice(1).reverse()]);
    const started = newGame(4, seed);
    assert.equal(whoseTurn(started), started.starter);
  }
});

test('el estado del motor es JSON puro y act no modifica el original', () => {
  const g = newGame();
  const before = JSON.stringify(g);
  act(g, { type: 'placeIkizama', slot: '2' });
  assert.equal(JSON.stringify(g), before);
  assert.deepEqual(JSON.parse(before), g);
});

test('fase A: coloca por orden de Extinción y no repite espacio', () => {
  let g = newGame();
  const [first, second] = g.order!;
  assert.equal(whoseTurn(g), first);
  g = act(g, { type: 'placeIkizama', slot: '3' });
  assert.equal(g.players[first].ikizama, '3');
  assert.equal(whoseTurn(g), second);
  throws(() => act(g, { type: 'placeIkizama', slot: '3' }), /ocupado/);
  throws(() => act(g, { type: 'placeIkizama', slot: '9' } as any), /desconocido/);
  assert.equal(playerStats(g, first).ikizama, 'Turno 3');
});

test('fase A: desde el mes 2 el más adelantado en Extinción coloca primero; en empate, el de arriba de la pila', () => {
  let g = newGame(4);
  g = tweak(g, (d) => {
    d.players[2].fire = 2;
    d.players[1].fire = 2;
    d.fireStack = [2, 1, ...d.fireStack.filter((i) => i !== 1 && i !== 2)];
    d.order = [...d.fireStack];
  });
  const { g: after, order } = placeAll(g, ['1-4', '1', '2', '3']);
  assert.equal(after.phase, 'actions');
  assert.equal(order[0], 2); // mismo nivel que el jugador 1 pero más arriba en la pila
  assert.equal(order[1], 1);
});

test('fase B: el orden de turno es el del marcador de Ikizama', () => {
  const { g } = placeAll(newGame(4), ['4', '1', '1-4', '3']);
  assert.equal(g.phase, 'actions');
  const slots = g.turnList!.map((i) => g.players[i].ikizama);
  assert.deepEqual(slots, ['1-4', '1', '3', '4']);
});

// --- Fase B1 -----------------------------------------------------------------------------------

test('el espacio 1-4 gana 1 mon, no contrata ni cobra ingresos y elige 1-4 pasos', () => {
  let g = turnOf(newGame(), '1-4');
  assert.equal(g.turn!.step, 'move');
  assert.equal(player(g).resources.mon, 9);
  throws(() => act(g, { type: 'income' }), /toca/);
  throws(() => act(g, { type: 'move', sandals: 0 }), /entre 1 y 4/);
  g = act(g, { type: 'move', base: 4 });
  assert.equal(player(g).oyakata, 'street-b2'); // queue → t2 → t1 → b1 → b2
});

test('ingresos: +4 mons y pasa al movimiento', () => {
  let g = turnOf(newGame(), '1');
  const mons = player(g).resources.mon;
  g = act(g, { type: 'income' });
  assert.equal(player(g).resources.mon, mons + 4);
  assert.equal(g.turn!.step, 'move');
});

test('contratar: paga el coste, coge los mons de la carta, usa un Kobun y avanza la Extinción', () => {
  let g = turnOf(newGame(), '1');
  const card = 'dice-maker'; // coste 3, fuego 1
  g = tweak(g, (d) => {
    d.row[0] = { card, mons: 2 };
    d.players[d.turn!.player].resources.mon = 1;
  });
  const p = g.turn!.player;
  const lot = 'lot-top-left-1';
  g = act(g, { type: 'hire', card, lot });
  assert.equal(g.players[p].resources.mon, 0); // 1 + 2 de la carta - 3
  assert.equal(g.players[p].kobun, KOBUN_PER_PLAYER - 2);
  assert.deepEqual(g.lots[lot], { kind: 'character', card, owner: p, xp: 0 });
  assert.ok(!g.row.some((r) => r.card === card));
  assert.equal(g.players[p].fire, 1);
  assert.equal(g.fireStack[0], p, 'la ficha se pone encima de la pila');
  assert.equal(g.turn!.step, 'move');
});

test('contratar: esquina +2 mons, ficha «Contratar −1» y errores', () => {
  const base = tweak(turnOf(newGame(), '1'), (d) => {
    d.row[0] = { card: 'carpenter', mons: 0 }; // coste 6
    d.players[d.turn!.player].resources.mon = 7;
  });
  throws(() => act(base, { type: 'hire', card: 'carpenter', lot: 'lot-top-left-4' }), /mon/); // 6 + 2 > 7
  const withToken = tweak(base, (d) => d.players[d.turn!.player].specials.push('hire'));
  const g = act(withToken, { type: 'hire', card: 'carpenter', lot: 'lot-top-left-4' }); // 5 + 2 = 7
  assert.equal(g.players[g.turn!.player].resources.mon, 0);
  throws(() => act(base, { type: 'hire', card: 'carpenter', lot: OUTER_LOTS.at(-1)! }), /ocupado/);
  throws(() => act(base, { type: 'hire', card: 'monk', lot: 'lot-top-left-1' }), /fila/);
  const noKobun = tweak(base, (d) => (d.players[d.turn!.player].kobun = 0));
  throws(() => act(noKobun, { type: 'hire', card: 'carpenter', lot: 'lot-top-left-1' }), /Kobun/);
});

test('la Torre Antiincendios da 3 IKI al contratar un personaje con fuego, y solo entonces', () => {
  let g = turnOf(newGame(), '1');
  g = tweak(g, (d) => {
    d.players[d.turn!.player].buildings.push('fire-tower');
    d.row[0] = { card: 'book-seller', mons: 0 }; // sin fuego
    d.row[1] = { card: 'dice-maker', mons: 0 }; // fuego 1
  });
  const p = g.turn!.player;
  assert.equal(act(g, { type: 'hire', card: 'book-seller', lot: 'lot-top-left-1' }).players[p].iki, 0);
  assert.equal(act(g, { type: 'hire', card: 'dice-maker', lot: 'lot-top-left-1' }).players[p].iki, 3);
});

test('el nivel de Extinción no pasa de 10 y la ficha sube a lo alto de la pila', () => {
  let g = turnOf(newGame(), '1');
  g = tweak(g, (d) => {
    const p = d.turn!.player;
    d.players.forEach((x, i) => (x.fire = i === p ? 9 : 10));
    d.fireStack = [...d.fireStack.filter((i) => i !== p), p].sort((a, b) => d.players[b].fire - d.players[a].fire);
    d.row[0] = { card: 'firefighter', mons: 0 }; // fuego 2, coste 6
    d.players[p].resources.mon = 20;
  });
  const p = g.turn!.player;
  g = act(g, { type: 'hire', card: 'firefighter', lot: 'lot-top-left-1' });
  assert.equal(g.players[p].fire, 10);
  assert.equal(g.fireStack[0], p);
});

// --- Fase B2: movimiento -----------------------------------------------------------------------

/** Pone al jugador de turno en `pos`, listo para mover. */
function at(g: Game, pos: string, edit: (d: Game) => unknown = () => {}) {
  return tweak(g, (d) => {
    d.turn!.step = 'move';
    d.players[d.turn!.player].oyakata = pos;
    edit(d);
  });
}

test('movimiento: casillas exactas siguiendo las flechas', () => {
  const g = turnOf(newGame(), '2');
  const go = (from: string, steps?: number, extra = {}) => act(at(g, from), { type: 'move', ...extra }).players[g.turn!.player].oyakata;
  // Desde la zona inicial el primer paso lleva a street-t2.
  assert.equal(go('queue-1'), 'street-t1'); // slot '2': queue → t2 → t1
  assert.equal(act(at(g, 'street-t1'), { type: 'move' }).players[g.turn!.player].oyakata, 'street-b2');
});

test('movimiento: sandalias suman casillas, no restan, y no se pueden gastar de más', () => {
  const g = turnOf(newGame(), '1');
  const p = g.turn!.player;
  let m = act(at(g, 'street-t1', (d) => (d.players[p].resources.sandal = 2)), { type: 'move', sandals: 2 });
  assert.equal(m.players[p].oyakata, 'street-b3');
  assert.equal(m.players[p].resources.sandal, 0);
  throws(() => act(at(g, 'street-t1', (d) => (d.players[p].resources.sandal = 1)), { type: 'move', sandals: 2 }), /sandal/);
  throws(() => act(at(g, 'street-t1'), { type: 'move', sandals: -1 }), /Sandalias/);
});

test('movimiento: la ficha «Mover +1» añade un espacio y solo si la tienes', () => {
  const g = turnOf(newGame(), '1');
  const p = g.turn!.player;
  throws(() => act(at(g, 'street-t1'), { type: 'move', bonus: true }), /Mover/);
  const m = act(at(g, 'street-t1', (d) => d.players[p].specials.push('move')), { type: 'move', bonus: true });
  assert.equal(m.players[p].oyakata, 'street-b2');
});

test('movimiento: cruzar de street-t3 a street-t2 da 1 de experiencia a todos tus personajes', () => {
  const g = turnOf(newGame(), '2');
  const p = g.turn!.player;
  const mine = Object.values(g.lots).find((l) => l.owner === p)!;
  const m = act(at(g, 'street-t3'), { type: 'move' }); // t3 → t2 → t1
  assert.equal(m.players[p].oyakata, 'street-t1');
  assert.equal(Object.values(m.lots).find((l) => l.owner === p)!.xp, mine.xp + 1);
  // No cruza: t2 → t1 → b1
  const n = act(at(g, 'street-t2'), { type: 'move' });
  assert.equal(Object.values(n.lots).find((l) => l.owner === p)!.xp, mine.xp);
});

test('movimiento desde la zona inicial: el primer paso no da vuelta', () => {
  const g = tweak(turnOf(newGame(), '3'), (d) => (d.turn!.step = 'move'));
  const p = g.turn!.player;
  const m = act(g, { type: 'move' }); // oyakata en la cola
  assert.equal(m.players[p].oyakata, 'street-b1'); // queue → t2 → t1 → b1
  assert.ok(Object.values(m.lots).every((l) => l.xp === 0));
});

test('retiro al dar la vuelta: recupera el Kobun, la carta va a retirados y llega la ficha especial', () => {
  const g = turnOf(newGame(), '1');
  const p = g.turn!.player;
  const m = act(
    at(g, 'street-t3', (d) => {
      d.lots['lot-top-left-1'] = { kind: 'character', card: 'monk', owner: p, xp: 2 };
      d.lots['lot-top-left-2'] = { kind: 'character', card: 'dyer', owner: p, xp: 0 };
      d.players[p].kobun -= 2;
    }),
    { type: 'move' },
  );
  assert.equal(m.lots['lot-top-left-1'], undefined);
  assert.deepEqual(m.players[p].retired, ['monk']);
  assert.deepEqual(m.players[p].specials, ['hire']);
  assert.equal(m.lots['lot-top-left-2'].xp, 1);
  assert.equal(m.players[p].kobun, KOBUN_PER_PLAYER - 1 - 1); // el inicial + el Tintorero
});

// --- Fase B2: negocios -------------------------------------------------------------------------

/** Turno del jugador de espacio '1' detenido en `pos`, listo para negocios, con recursos a medida. */
function shopping(pos: string, res = {}, edit: (d: Game) => unknown = () => {}) {
  return tweak(turnOf(newGame(), '1'), (d) => {
    d.turn!.step = 'business';
    const p = d.players[d.turn!.player];
    p.oyakata = pos;
    Object.assign(p.resources, { mon: 0, rice: 0, sandal: 0, wood: 0, koban: 0 }, res);
    edit(d);
  });
}

const res = (g: Game) => g.players[g.turn!.player].resources;

test('tiendas simples: Sandalias, Arroz, Casa de Empeños, Cambio', () => {
  let g = act(shopping('street-t2', { mon: 5 }), { type: 'shop' });
  assert.deepEqual([res(g).mon, res(g).sandal], [3, 2]);
  g = act(shopping('street-t1', { mon: 5 }), { type: 'shop' });
  assert.deepEqual([res(g).mon, res(g).rice], [2, 2]);
  g = act(shopping('street-b3', { sandal: 1 }), { type: 'shop', choice: 'sandal' });
  assert.deepEqual([res(g).mon, res(g).sandal], [4, 0]);
  g = act(shopping('street-b3', { rice: 1 }), { type: 'shop', choice: 'rice' });
  assert.deepEqual([res(g).mon, res(g).rice], [4, 0]);
  throws(() => act(shopping('street-b3'), { type: 'shop', choice: 'rice' }), /rice/);
  g = act(shopping('street-t3', { mon: 6 }), { type: 'shop', choice: 'koban1' });
  assert.deepEqual([res(g).mon, res(g).koban], [0, 1]);
  g = act(shopping('street-t3', { mon: 10 }), { type: 'shop', choice: 'koban2' });
  assert.deepEqual([res(g).mon, res(g).koban], [0, 2]);
  g = act(shopping('street-t3'), { type: 'shop', choice: 'mons' });
  assert.equal(res(g).mon, 2);
  throws(() => act(shopping('street-t3', { mon: 5 }), { type: 'shop', choice: 'koban1' }), /mon/);
});

test('Torre de Incendios: +1 de Extinción; cada tienda solo una vez por turno', () => {
  let g = act(shopping('street-b1'), { type: 'shop' });
  assert.equal(g.players[g.turn!.player].fire, 1);
  throws(() => act(g, { type: 'shop' }), /Ya has usado/);
});

test('Mercado de Pescado: un pescado por estación y se retira de la oferta', () => {
  let g = shopping('street-t4', { mon: 10 });
  g = act(g, { type: 'shop', fish: 'spring-fish-4' });
  assert.equal(res(g).mon, 6);
  assert.deepEqual(g.players[g.turn!.player].fish, ['spring-fish-4']);
  assert.deepEqual(g.market.fish, ['spring-fish-2']);
  const again = tweak(g, (d) => (d.turn!.didShop = false));
  throws(() => act(again, { type: 'shop', fish: 'spring-fish-2' }), /un Pescado por estación/);
  throws(() => act(shopping('street-t4', { mon: 10 }), { type: 'shop', fish: 'summer-fish-2' }), /a la venta/);
});

test('Tienda de Tabaco: pipa, bolsa o ambas, con el efecto de la pipa al comprarla', () => {
  let g = act(shopping('street-b2', { mon: 5 }), { type: 'shop', pipe: 'spring-fire-2', bag: 'spring-box-2' });
  const p = g.players[g.turn!.player];
  assert.equal(res(g).mon, 1);
  assert.deepEqual([p.pipes, p.tobacco, p.fire], [['spring-fire-2'], ['spring-box-2'], 1]);
  throws(() => act(shopping('street-b2', { mon: 5 }), { type: 'shop' }), /Elige/);
  throws(() => act(shopping('street-b2', { mon: 1 }), { type: 'shop', pipe: 'spring-fire-3' }), /mon/);
});

test('pipa de Invierno de experiencia: sube un personaje propio', () => {
  const g = shopping('street-b2', { mon: 5 }, (d) => {
    d.market = { fish: [], pipes: ['winter-pipe-2'], bags: [] };
  });
  const mine = Object.keys(g.lots).find((id) => g.lots[id].owner === g.turn!.player)!;
  const done = act(g, { type: 'shop', pipe: 'winter-pipe-2', target: mine });
  assert.equal(done.lots[mine].xp, 1);
  throws(() => act(g, { type: 'shop', pipe: 'winter-pipe-2', target: 'lot-top-left-1' }), /tus personajes/);

  // Sin personajes en el tablero se puede comprar igual (la pipa dobla el tabaco); la experiencia se pierde.
  const alone = tweak(g, (d) => {
    for (const [id, l] of Object.entries(d.lots)) if (l.owner === d.turn!.player) delete d.lots[id];
  });
  assert.deepEqual(act(alone, { type: 'shop', pipe: 'winter-pipe-2' }).players[g.turn!.player].pipes, ['winter-pipe-2']);
});

test('Lugar de Construcción: 1 mon → arroz, o 1 mon + coste → edificio', () => {
  let g = act(shopping('street-b4', { mon: 1 }), { type: 'shop', choice: 'rice' });
  assert.deepEqual([res(g).mon, res(g).rice], [0, 1]);
  g = shopping('street-b4', { mon: 1, wood: 1, koban: 1 }, (d) => (d.buildings = ['tavern', 'well']));
  const p = g.turn!.player;
  const built = act(g, { type: 'shop', choice: 'build', building: 'tavern', lot: 'lot-top-left-1' });
  assert.deepEqual(built.lots['lot-top-left-1'], { kind: 'building', card: 'tavern', owner: p, xp: 0 });
  assert.deepEqual(built.players[p].buildings, ['tavern']);
  assert.deepEqual(built.buildings, ['well']);
  assert.equal(built.players[p].kobun, KOBUN_PER_PLAYER - 2);
  assert.deepEqual([res(built).mon, res(built).wood, res(built).koban], [0, 0, 0]);
  throws(() => act(g, { type: 'shop', choice: 'build', building: 'kabuki-theater', lot: 'lot-top-left-1' }), /no está disponible/);
  throws(() => act(shopping('street-b4', { mon: 0, wood: 1, koban: 1 }, (d) => (d.buildings = ['tavern'])), { type: 'shop', choice: 'build', building: 'tavern', lot: 'lot-top-left-1' }), /mon/);
});

// --- Negocios con personajes -------------------------------------------------------------------

const stallLot = 'lot-top-left-1'; // puesto de street-t1 (Arroz)

function withCharacter(pos: string, owner: 'me' | 'other', card: string, xp = 0, res = {}) {
  return shopping(pos, res, (d) => {
    const who = owner === 'me' ? d.turn!.player : (d.turn!.player + 1) % d.players.length;
    d.lots[stallLot] = { kind: 'character', card, owner: who, xp };
    d.players[who].kobun -= 1;
  });
}

test('personaje ajeno: aplica su habilidad y su Kobun gana experiencia; el propio no', () => {
  const other = act(withCharacter('street-t1', 'other', 'book-seller'), { type: 'character', lot: stallLot });
  assert.deepEqual([res(other).mon, res(other).sandal], [1, 1]);
  assert.equal(other.lots[stallLot].xp, 1);
  const mine = act(withCharacter('street-t1', 'me', 'book-seller'), { type: 'character', lot: stallLot });
  assert.equal(mine.lots[stallLot].xp, 0);
  throws(() => act(other, { type: 'character', lot: stallLot }), /Ya has activado/);
});

test('personaje: tienda y personaje se pueden hacer en cualquier orden', () => {
  let g = withCharacter('street-t1', 'other', 'book-seller', 0, { mon: 3 });
  g = act(g, { type: 'character', lot: stallLot });
  g = act(g, { type: 'shop' });
  assert.deepEqual([res(g).mon, res(g).rice], [3 + 1 - 3, 2]); // +1 del Vendedor, −3 de la Tienda de Arroz
});

test('solo se pueden activar los personajes de los puestos de tu casilla', () => {
  throws(() => act(withCharacter('street-t2', 'other', 'book-seller'), { type: 'character', lot: stallLot }), /puestos/);
});

test('personaje ajeno que se retira devuelve el Kobun a su dueño al instante', () => {
  const g = act(withCharacter('street-t1', 'other', 'book-seller', 2), { type: 'character', lot: stallLot });
  const owner = (g.turn!.player + 1) % g.players.length;
  assert.equal(g.lots[stallLot], undefined);
  assert.deepEqual(g.players[owner].retired, ['book-seller']);
  assert.equal(g.players[owner].kobun, KOBUN_PER_PLAYER - 1); // solo el personaje inicial sigue en el tablero
});

test('habilidades de intercambio: pagar o fallar sin cambiar el estado', () => {
  const g = withCharacter('street-t1', 'other', 'dyer', 0, { mon: 2 });
  const done = act(g, { type: 'character', lot: stallLot });
  assert.deepEqual([res(done).mon, done.players[done.turn!.player].iki], [0, 4]);
  throws(() => act(withCharacter('street-t1', 'other', 'dyer', 0, { mon: 1 }), { type: 'character', lot: stallLot }), /mon/);
});

test('Costurera: paga 1 mon y da experiencia a un personaje propio', () => {
  const g = withCharacter('street-t1', 'me', 'seamstress', 0, { mon: 1 });
  const p = g.turn!.player;
  const target = Object.keys(g.lots).find((id) => id !== stallLot && g.lots[id].owner === p)!;
  const done = act(g, { type: 'character', lot: stallLot, target });
  assert.equal(done.lots[target].xp, 1);
  assert.equal(res(done).mon, 0);
  throws(() => act(g, { type: 'character', lot: stallLot, target: 'lot-top-left-2' }), /tus personajes/);
});

test('Carpintero: construye con 1 madera menos', () => {
  const g = tweak(withCharacter('street-t1', 'me', 'carpenter', 0, { mon: 0, wood: 0, koban: 1 }), (d) => (d.buildings = ['tavern']));
  const done = act(g, { type: 'character', lot: stallLot, building: 'tavern', buildLot: 'lot-top-left-2' }); // Taberna: 1 madera + 1 Koban
  assert.equal(done.lots['lot-top-left-2'].card, 'tavern');
  assert.equal(res(done).koban, 0);
});

test('Cometas: intercambia 2 cartas; los Kobun siguen con su carta', () => {
  const g = tweak(withCharacter('street-t1', 'me', 'kite-maker'), (d) => {
    d.lots['lot-top-left-2'] = { kind: 'character', card: 'dyer', owner: (d.turn!.player + 1) % d.players.length, xp: 1 };
  });
  const done = act(g, { type: 'character', lot: stallLot, lots: [stallLot, 'lot-top-left-2'] });
  assert.equal(done.lots[stallLot].card, 'dyer');
  assert.equal(done.lots[stallLot].xp, 1);
  assert.equal(done.lots['lot-top-left-2'].card, 'kite-maker');
  const entry = done.log.findLast((e) => e.type === 'character')!;
  assert.equal(logLine(done, entry).replace(/<[^>]+>/g, '').replace(/^.* activa/, 'activa'),
    'activa a Constructor de Cometas e intercambia Constructor de Cometas (Nagaya amarillo) y Tintorero (Nagaya amarillo)');
  throws(() => act(g, { type: 'character', lot: stallLot, lots: [stallLot, 'lot-top-left-3'] }), /2 cartas/);
});

test('Fuegos Artificiales: 4 IKI para ti y 2 mons a cada oponente', () => {
  const g = withCharacter('street-t1', 'me', 'fireworks-maker');
  const p = g.turn!.player;
  const done = act(g, { type: 'character', lot: stallLot });
  assert.equal(done.players[p].iki, 4);
  done.players.forEach((q, i) => i !== p && assert.equal(q.resources.mon, g.players[i].resources.mon + 2));
});

// --- Fin de turno y de mes ---------------------------------------------------------------------

test('fin de turno: recupera el Ikizama y pasa al siguiente; no se puede terminar sin mover', () => {
  let g = turnOf(newGame(), '1');
  throws(() => act(g, { type: 'endTurn' }), /toca/);
  const first = g.turn!.player;
  g = act(act(act(g, { type: 'income' }), { type: 'move' }), { type: 'endTurn' });
  assert.equal(g.players[first].ikizama, null);
  assert.notEqual(g.turn!.player, first);
  assert.equal(g.turn!.step, g.turn!.slot === '1-4' ? 'move' : 'b1');
});

test('mes con evento simple: +1 mon en las cartas que quedan y empieza el mes siguiente', () => {
  let g = newGame();
  g = playMonth(g);
  assert.equal(g.month, 2);
  assert.equal(g.phase, 'ikizama');
  assert.equal(g.row.length, 4 + 4);
  assert.deepEqual(g.row.slice(0, 4).map((r) => r.mons), [1, 1, 1, 1]);
  assert.deepEqual(g.row.slice(4).map((r) => r.mons), [0, 0, 0, 0]);
});

/** Juega un mes entero con la primera jugada legal que no contrata, para no complicar el estado. */
function playMonth(g: Game) {
  const month = g.month;
  while (g.month === month && g.phase !== 'event') {
    const options = legalActions(g);
    const pick = options.find((a) => a.type === 'placeIkizama') ?? options.find((a) => a.type === 'income') ?? options.find((a) => a.type === 'move') ?? options.find((a) => a.type === 'endTurn');
    g = act(g, pick!);
  }
  return g;
}

test('el mes 3 (Día de Pago) se resuelve y empieza el mes 4 con las cartas de Verano', () => {
  let g = newGame();
  g = playMonth(playMonth(playMonth(g)));
  // Sin arroz suficiente puede quedar una decisión de comida; la respondemos con la primera opción legal.
  while (g.pending) g = act(g, legalActions(g)[0]);
  assert.equal(g.month, 4);
  assert.equal(g.phase, 'ikizama');
  assert.equal(g.row.length, 4);
  for (const r of g.row) assert.equal(CHARACTERS_BY_ID[r.card].season, 'summer');
});

// --- Partidas al azar --------------------------------------------------------------------------

test('partidas al azar con jugadas legales: llegan al Día de Año Nuevo con el estado siempre coherente', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const rng = createRng(seed * 977);
    const n = 3 + (seed % 2);
    let g = newGame(n, seed);
    let steps = 0;
    while (g.phase !== 'newyear' && g.phase !== 'ended' && steps++ < 20000) {
      const options = legalActions(g);
      assert.ok(options.length > 0, `sin jugadas en ${g.phase}/${g.turn?.step} (semilla ${seed})`);
      g = act(g, options[Math.floor(rng.next() * options.length)]);
      assertCoherent(g);
    }
    assert.equal(g.phase, 'newyear', `la semilla ${seed} no llegó al mes 13`);
    assert.equal(g.month, 13);
    assert.equal(g.pending, null);
    assert.ok(g.players.every((p) => p.oyakata === null), 'los Oyakata se recogen');
  }
});

function assertCoherent(g: Game) {
  g.players.forEach((p, i) => {
    for (const [k, v] of Object.entries(p.resources)) assert.ok(v >= 0, `${k} negativo`);
    assert.ok(p.iki >= 0 && p.fire >= 0 && p.fire <= 10);
    const onBoard = Object.values(g.lots).filter((l) => l.owner === i).length;
    assert.equal(p.kobun + onBoard, KOBUN_PER_PLAYER, 'los Kobun se conservan');
  });
  const sorted = g.fireStack.every((q, k) => k === 0 || g.players[g.fireStack[k - 1]].fire >= g.players[q].fire);
  assert.ok(sorted && g.fireStack.length === g.players.length, 'pila de Extinción ordenada');
  // Cada carta está en un único sitio.
  const seen = [...g.row.map((r) => r.card), ...Object.values(g.lots).map((l) => l.card), ...g.players.flatMap((p) => p.retired)];
  assert.equal(new Set(seen).size, seen.length, 'carta duplicada');
  void ZONES_BY_ID;
}
