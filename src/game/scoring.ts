import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.ts';
import { BUILDINGS_BY_ID } from '../data/decks.ts';
import { MARKET_BY_ID } from '../data/market.ts';
import type { CharacterType, FinalScore, Game, MarketToken, Player, Score } from '../types.ts';

/**
 * Puntuación final (docs/reglas.md, p. 10-11). Pura: sirve para la tabla del final y, a mitad de partida, como
 * estimación (los personajes del tablero cuentan igual que los retirados).
 */

export const VARIETY_IKI = [0, 1, 4, 9, 16, 25]; // por número de tipos de personaje diferentes
export const FISH_IKI = [0, 3, 6, 10, 15]; // por número de pescados (de estaciones) diferentes
export const KOBAN_IKI = 3;
export const MONS_PER_IKI = 4;
export const SANDAL_BUILDING = { per: 3, max: 30 }; // Casa Comercial
export const RICE_BUILDING = { per: 4, max: 32 }; // Almacén
export const WELL_PER_SPACE = 2; // Pozo

/** Tipo de cada carta de personaje del jugador (en el tablero o retirada). El Marionetista con Comodín toma el tipo elegido. */
export function characterTypes(g: Game, p: number): CharacterType[] {
  const player = g.players[p];
  const cards = [...Object.values(g.lots).filter((l) => l.kind === 'character' && l.owner === p).map((l) => l.card), ...player.retired];
  return cards.map((card) => (card === 'puppeteer' && player.wildType ? player.wildType : CHARACTERS_BY_ID[card].type));
}

/** Contratados por tipo: { tipo: n }. */
export function typeCounts(g: Game, p: number) {
  const counts: Partial<Record<CharacterType, number>> = {};
  for (const t of characterTypes(g, p)) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

/** IKI del Pescado: por tipos diferentes + extra de los más caros de cada estación. */
export function fishScore(player: Player) {
  const bonus = player.fish.reduce((sum, id) => sum + MARKET_BY_ID[id].bonus!, 0);
  return FISH_IKI[Math.min(player.fish.length, FISH_IKI.length - 1)] + bonus;
}

function bagScore(g: Game, p: number, bag: MarketToken) {
  const player = g.players[p];
  const { iki, per } = bag.score!;
  if (iki != null) return iki;
  const counts = Object.values(typeCounts(g, p));
  return {
    fire2: Math.floor(player.fire / 2),
    mostType: Math.max(0, ...counts),
    types: counts.length,
    mon4: Math.floor(player.resources.mon / MONS_PER_IKI),
  }[per!];
}

function buildingScore(g: Game, p: number, building: string) {
  const player = g.players[p];
  const def = BUILDINGS_BY_ID[building];
  switch (def.score) {
    case 'sandal': return Math.min(SANDAL_BUILDING.max, SANDAL_BUILDING.per * player.resources.sandal);
    case 'rice': return Math.min(RICE_BUILDING.max, RICE_BUILDING.per * player.resources.rice);
    case 'fish': return fishScore(player);
    case 'fire': return WELL_PER_SPACE * player.fire;
    default: return def.iki;
  }
}

/** Desglose de un jugador: marcador, variedad, pescado, tabaco, edificios, recursos y total. */
export function scorePlayer(g: Game, p: number): Score {
  const player = g.players[p];
  const tobacco = player.tobacco.reduce((sum, id) => sum + bagScore(g, p, MARKET_BY_ID[id]), 0) * (player.pipes.length ? 2 : 1);
  const score: Score = {
    track: player.iki,
    variety: VARIETY_IKI[Math.min(Object.keys(typeCounts(g, p)).length, VARIETY_IKI.length - 1)],
    fish: fishScore(player),
    tobacco,
    buildings: player.buildings.reduce((sum, id) => sum + buildingScore(g, p, id), 0),
    resources: player.resources.koban * KOBAN_IKI + player.resources.wood + Math.floor(player.resources.mon / MONS_PER_IKI),
  };
  score.total = Object.values(score).reduce((a, b) => a + b, 0);
  return score;
}

/**
 * Puntuación de todos y clasificación: más IKI; si empatan, más Extinción de Incendios; si sigue el empate, quien
 * esté más arriba en la pila. `ranking` son índices de jugador, el primero es el ganador.
 */
export function scoreGame(g: Game): FinalScore {
  const scores = g.players.map((_, p) => scorePlayer(g, p));
  const ranking = g.players
    .map((_, p) => p)
    .sort((a, b) => scores[b].total! - scores[a].total! || g.players[b].fire - g.players[a].fire || g.fireStack.indexOf(a) - g.fireStack.indexOf(b));
  return { scores, ranking, winner: ranking[0] };
}

export { CHARACTER_TYPES };
