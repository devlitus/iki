import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.js';
import { BUILDINGS_BY_ID } from '../data/decks.js';
import { ZONES_BY_ID } from '../data/zones.js';
import { KOBUN_PER_PLAYER } from './setup.js';
import { scorePlayer } from './scoring.js';

/**
 * Resumen de lo que un jugador necesita saber de su tablero (ver docs/reglas.md): recursos, peones,
 * marcadores, colección, personajes y una estimación de la puntuación final.
 */

export const SPECIALS = {
  move: 'Mover +1',
  'avoid-fire': 'Evitar un incendio',
  wild: 'Comodín',
  hire: 'Contratar −1',
};

export const MAX_FISH = 4;
export const MAX_TYPES = Object.keys(CHARACTER_TYPES).length;

const characterName = (id) => CHARACTERS_BY_ID[id]?.name ?? id;

export function playerStats(game, index) {
  const p = game.players[index];
  const hired = Object.entries(game.lots)
    .filter(([, l]) => l.kind === 'character' && l.owner === index)
    .map(([lotId, l]) => ({ lotId, card: l.card, name: characterName(l.card), type: CHARACTERS_BY_ID[l.card]?.type, xp: l.xp }));
  const retired = p.retired.map((card) => ({ card, name: characterName(card), type: CHARACTERS_BY_ID[card]?.type }));
  const types = new Set([...hired, ...retired].map((c) => c.type).filter(Boolean));

  const score = scorePlayer(game, index); // estimación mientras la partida sigue

  return {
    resources: p.resources,
    specials: p.specials.map((id) => SPECIALS[id] ?? id),
    kobunFree: p.kobun,
    kobunTotal: KOBUN_PER_PLAYER,
    ikizama: p.ikizama ? ZONES_BY_ID[p.ikizama]?.label ?? p.ikizama : 'En su tablero',
    oyakata: ZONES_BY_ID[p.oyakata]?.label ?? p.oyakata,
    iki: p.iki,
    fire: p.fire,
    fireStack: game.fireStack.indexOf(index) + 1,
    turn: game.turnOrder.indexOf(index) + 1,
    fish: p.fish.length,
    pipes: p.pipes.length,
    tobacco: p.tobacco.length,
    hired,
    retired,
    types: [...types].map((t) => CHARACTER_TYPES[t].label),
    buildings: p.buildings.map((id) => BUILDINGS_BY_ID[id]?.name ?? id),
    rice: hired.length, // arroz que pagará el Día de Pago
    score,
  };
}
