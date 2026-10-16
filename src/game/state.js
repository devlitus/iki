import { CHARACTERS_BY_ID } from '../data/characters.js';
import { BUILDINGS_BY_ID } from '../data/decks.js';
import { ZONES_BY_ID, LOT_IDS } from '../data/zones.js';

/**
 * Operaciones básicas sobre el estado de la partida. Todas MUTAN el estado `g` que reciben: el motor trabaja
 * siempre sobre una copia (ver engine.js), así que aquí no hace falta copiar nada.
 */

export const MAX_FIRE = 10;
export const RESOURCES = ['mon', 'rice', 'sandal', 'wood', 'koban'];

/** Lanza un error de jugada no válida. */
export function rule(ok, message) {
  if (!ok) throw new Error(message);
}

/** [{ res, n }] → { res: n } (suma las repetidas). */
export function toCost(list) {
  const out = {};
  for (const { res, n } of list) out[res] = (out[res] ?? 0) + n;
  return out;
}

export function log(g, entry) {
  g.log.push({ month: g.month, ...entry });
  if (g.log.length > 300) g.log.splice(0, g.log.length - 300);
}

const have = (p, res) => (res === 'iki' ? p.iki : p.resources[res]);

export const canPay = (g, p, cost) => Object.entries(cost).every(([res, n]) => have(g.players[p], res) >= n);

/** Paga `cost` ({ res: n }, también 'iki'); lanza un error si no llega. El IKI nunca baja de 0. */
export function pay(g, p, cost, what = 'la jugada') {
  const player = g.players[p];
  for (const [res, n] of Object.entries(cost)) rule(have(player, res) >= n, `No tienes ${n} de ${res} para ${what}`);
  for (const [res, n] of Object.entries(cost)) {
    if (res === 'iki') player.iki -= n;
    else player.resources[res] -= n;
  }
}

/** Recibe `gain` ({ res: n }, también 'iki'). Un IKI negativo (salario del Jornalero) no baja de 0. */
export function receive(g, p, gain) {
  const player = g.players[p];
  for (const [res, n] of Object.entries(gain)) {
    if (res === 'iki') player.iki = Math.max(0, player.iki + n);
    else player.resources[res] += n;
  }
}

/**
 * Avanza `n` espacios el marcador de Extinción de Incendios. La ficha se pone encima de las que ya estén en el espacio
 * de destino; en el 10 (máximo) sube a lo alto de la pila de ese espacio. `fireStack` va de arriba abajo y siempre
 * ordenado por nivel descendente.
 */
export function advanceFire(g, p, n = 1) {
  const player = g.players[p];
  for (let i = 0; i < n; i++) {
    player.fire = Math.min(MAX_FIRE, player.fire + 1);
    g.fireStack = g.fireStack.filter((q) => q !== p);
    const at = g.fireStack.findIndex((q) => g.players[q].fire <= player.fire);
    g.fireStack.splice(at === -1 ? g.fireStack.length : at, 0, p);
  }
  if (n > 0) log(g, { type: 'fire', player: p, level: player.fire });
}

/** Solares con un personaje (no edificio) de `owner`. */
export const characterLots = (g, owner) =>
  Object.entries(g.lots).filter(([, l]) => l.kind === 'character' && l.owner === owner).map(([id]) => id);

/** Quita la carta del solar (personaje o edificio): su dueño recupera el Kobun. Devuelve el solar. */
export function removeLot(g, lotId) {
  const lot = g.lots[lotId];
  delete g.lots[lotId];
  const owner = g.players[lot.owner];
  owner.kobun += 1;
  if (lot.kind === 'building') owner.buildings = owner.buildings.filter((b) => b !== lot.card);
  return lot;
}

/**
 * +1 de experiencia al personaje de un solar. Al llegar al círculo se retira: su carta pasa a la columna del
 * tablero de su dueño, recupera el Kobun y, si la carta lo da, recibe la ficha Especial.
 */
export function gainXp(g, lotId) {
  const lot = g.lots[lotId];
  if (!lot || lot.kind !== 'character') return;
  lot.xp += 1;
  const def = CHARACTERS_BY_ID[lot.card];
  if (lot.xp < def.salary.length) return;
  removeLot(g, lotId);
  const owner = g.players[lot.owner];
  owner.retired.push(lot.card);
  if (def.retireToken) owner.specials.push(def.retireToken);
  log(g, { type: 'retire', player: lot.owner, card: lot.card });
}

/** Casilla de salario actual de un personaje en juego, o la máxima si está retirado. */
export const salaryOf = (def, xp) => def.salary[Math.min(xp, def.salary.length - 1)];

/**
 * Construye un edificio de los disponibles (`g.buildings`) en un solar libre.
 * @param {{ building: string, lot: string, discount?: { res: string }, fee?: number }} o
 *   discount = recurso del que se descuenta 1 (Carpintero, Tallador); fee = mons extra (Lugar de Construcción).
 */
export function build(g, p, { building, lot, discount, fee = 0 }) {
  const def = BUILDINGS_BY_ID[building];
  rule(def && g.buildings.includes(building), `${building} no está disponible`);
  assertFreeLot(g, lot);
  rule(g.players[p].kobun > 0, 'No tienes Kobun disponibles');
  const cost = { ...def.cost };
  if (discount) cost[discount.res] = Math.max(0, (cost[discount.res] ?? 0) - 1);
  cost.mon = (cost.mon ?? 0) + fee + ZONES_BY_ID[lot].extraCost;
  pay(g, p, cost, `construir ${def.name}`);
  g.buildings = g.buildings.filter((b) => b !== building);
  g.players[p].buildings.push(building);
  g.players[p].kobun -= 1;
  g.lots[lot] = { kind: 'building', card: building, owner: p, xp: 0 };
  log(g, { type: 'build', player: p, card: building, lot });
}

export function assertFreeLot(g, lot) {
  rule(LOT_IDS.includes(lot), `${lot} no es un solar`);
  rule(!g.lots[lot], `${lot} está ocupado`);
}
