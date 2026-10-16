import { CHARACTERS_BY_ID } from '../data/characters.js';
import { MARKET_BY_ID } from '../data/market.js';
import { advanceFire, build, characterLots, gainXp, log, pay, receive, rule, toCost } from './state.js';

/**
 * Lo que se hace al activar una tienda o un personaje en la fase de Acciones. Cada función MUTA `g` (el motor ya
 * trabaja sobre una copia) y lanza un error si la jugada no es válida. Las elecciones del jugador llegan en `a`.
 */

// --- Personajes --------------------------------------------------------------------------------

/** Da +1 de experiencia a un personaje propio elegido en `target` (Costurera, Pipa de Invierno…). */
function xpToOwn(g, p, target) {
  rule(characterLots(g, p).includes(target), 'Elige uno de tus personajes');
  gainXp(g, target);
}

const ABILITIES = {
  gain: (g, p, def) => receive(g, p, toCost(def.ability.gain)),

  trade(g, p, def) {
    pay(g, p, toCost(def.ability.pay), def.name);
    receive(g, p, toCost(def.ability.gain));
  },

  fire(g, p, def) {
    advanceFire(g, p, 1);
    receive(g, p, toCost(def.ability.gain));
  },

  xp(g, p, def, a) {
    pay(g, p, toCost(def.ability.pay), def.name);
    xpToOwn(g, p, a.target);
  },

  build(g, p, def, a) {
    build(g, p, { building: a.building, lot: a.buildLot, discount: def.ability.discount });
  },

  swap(g, p, def, a) {
    const [x, y] = a.lots ?? [];
    rule(x !== y && g.lots[x]?.kind === 'character' && g.lots[y]?.kind === 'character', 'Elige 2 cartas de Personaje');
    [g.lots[x], g.lots[y]] = [g.lots[y], g.lots[x]]; // los Kobun siguen con su carta
  },

  gainOthers(g, p, def) {
    receive(g, p, toCost(def.ability.gain));
    g.players.forEach((_, q) => q !== p && receive(g, q, toCost(def.ability.others)));
  },
};

/**
 * Activa el personaje del solar `lotId` por `p`. Si es de otro jugador, gana 1 de experiencia después (puede
 * retirarse); si es tuyo, no.
 */
export function activateCharacter(g, p, lotId, a) {
  const lot = g.lots[lotId];
  rule(lot?.kind === 'character', 'Ahí no hay ningún personaje');
  const def = CHARACTERS_BY_ID[lot.card];
  ABILITIES[def.ability.kind](g, p, def, a);
  log(g, { type: 'character', player: p, card: lot.card, owner: lot.owner });
  // Cometas y Marionetas mueven cartas: la experiencia es de la carta, esté donde esté.
  const now = Object.keys(g.lots).find((id) => g.lots[id].card === def.id);
  if (lot.owner !== p && now) gainXp(g, now);
}

// --- Tiendas -----------------------------------------------------------------------------------

/** Compra una ficha de mercado de la estación actual: la paga y la quita de la oferta. */
function takeToken(g, p, id, kind) {
  const token = MARKET_BY_ID[id];
  const list = kind === 'fish' ? 'fish' : `${kind}s`; // g.market: { fish, pipes, bags }
  rule(token?.kind === kind && g.market[list].includes(id), `${id} no está a la venta`);
  pay(g, p, { mon: token.cost }, 'la ficha');
  g.market[list] = g.market[list].filter((t) => t !== id);
  return token;
}

const SHOPS = {
  'shop-sandals': (g, p) => {
    pay(g, p, { mon: 2 }, 'la Tienda de Sandalias');
    receive(g, p, { sandal: 2 });
  },

  'shop-rice': (g, p) => {
    pay(g, p, { mon: 3 }, 'la Tienda de Arroz');
    receive(g, p, { rice: 2 });
  },

  'shop-fire-tower': (g, p) => advanceFire(g, p, 1),

  'shop-tobacco': (g, p, a) => {
    rule(a.pipe || a.bag, 'Elige una Pipa, una Bolsa de Tabaco o ambas');
    if (a.pipe) {
      const pipe = takeToken(g, p, a.pipe, 'pipe');
      g.players[p].pipes.push(pipe.id);
      const e = pipe.effect;
      if (e.fire) advanceFire(g, p, e.fire);
      if (e.gain) receive(g, p, toCost(e.gain));
      if (e.xp && characterLots(g, p).length) xpToOwn(g, p, a.target); // sin personajes en el tablero, la experiencia se pierde
    }
    if (a.bag) g.players[p].tobacco.push(takeToken(g, p, a.bag, 'bag').id);
  },

  'shop-pawn': (g, p, a) => {
    rule(a.choice === 'rice' || a.choice === 'sandal', 'Elige arroz o sandalia');
    pay(g, p, { [a.choice]: 1 }, 'la Casa de Empeños');
    receive(g, p, { mon: 4 });
  },

  'shop-construction': (g, p, a) => {
    if (a.choice === 'rice') {
      pay(g, p, { mon: 1 }, 'el Lugar de Construcción');
      receive(g, p, { rice: 1 });
    } else {
      rule(a.choice === 'build', 'Elige arroz o construir');
      build(g, p, { building: a.building, lot: a.lot, fee: 1 });
    }
  },

  'shop-fish': (g, p, a) => {
    const fish = MARKET_BY_ID[a.fish];
    rule(fish, 'Elige un Pescado');
    rule(!g.players[p].fish.some((id) => MARKET_BY_ID[id].season === fish.season), 'Solo un Pescado por estación');
    g.players[p].fish.push(takeToken(g, p, a.fish, 'fish').id);
  },

  'shop-exchange': (g, p, a) => {
    if (a.choice === 'koban1') {
      pay(g, p, { mon: 6 }, 'la Tienda de Cambio');
      receive(g, p, { koban: 1 });
    } else if (a.choice === 'koban2') {
      pay(g, p, { mon: 10 }, 'la Tienda de Cambio');
      receive(g, p, { koban: 2 });
    } else {
      rule(a.choice === 'mons', 'Elige una opción de cambio');
      receive(g, p, { mon: 2 });
    }
  },
};

export function activateShop(g, p, shopId, a) {
  rule(SHOPS[shopId], `${shopId} no es una tienda`);
  SHOPS[shopId](g, p, a);
  log(g, { type: 'shop', player: p, shop: shopId });
}
