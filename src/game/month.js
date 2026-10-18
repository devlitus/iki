import { SEASONS } from '../data/decks.ts';
import { log } from './state.js';

/** Estación en curso: 3 meses cada una; el mes 13 (Año Nuevo) sigue siendo Invierno. */
export const seasonOf = (month) => SEASONS[Math.min(3, Math.floor((month - 1) / 3))];

const REVEALED_PER_MONTH = 4;

/** Inicio de mes: se muestran las 4 primeras cartas del mazo de la estación y empieza la fase A. */
export function startMonth(g) {
  const deck = g.decks[seasonOf(g.month).id];
  for (let i = 0; i < REVEALED_PER_MONTH && deck.length; i++) g.row.push({ card: deck.shift(), mons: 0 });
  g.phase = 'ikizama';
  g.order = [...g.fireStack]; // mes 1: sentido horario desde el inicial; luego, por Extinción de Incendios
  g.turn = null;
  log(g, { type: 'month', month: g.month });
}

/** Mes 13, Día de Año Nuevo: juegan por orden de Extinción (el más adelantado primero) y no hay fase A ni B1. */
export function startNewYear(g) {
  g.phase = 'newyear';
  g.order = [...g.fireStack];
  g.turnList = [...g.order];
  beginNewYearTurn(g, 0);
  log(g, { type: 'month', month: g.month });
}

export function beginNewYearTurn(g, index) {
  g.turn = { index, player: g.turnList[index], slot: null, step: 'place', didShop: false, didChar: false };
}
