import { CHARACTER_TYPES } from '../data/characters.ts';
import { log, rule } from './state.js';
import { scoreGame } from './scoring.js';

/** Fin de la partida (docs/reglas.md, p. 10): se recogen las cartas, se decide el Comodín y se puntúa. */

/** Tras el último turno del Día de Año Nuevo. */
export function finishGame(g) {
  g.turn = null;
  // Se recogen los personajes que siguen en el tablero (se colocan en las columnas del tablero de jugador).
  for (const [lotId, lot] of Object.entries(g.lots)) {
    if (lot.kind !== 'character') continue;
    g.players[lot.owner].retired.push(lot.card);
    g.players[lot.owner].kobun += 1;
    delete g.lots[lotId];
  }
  continueEnding(g);
}

/** Pregunta el tipo del Marionetista a cada jugador que tenga el Comodín; después puntúa. */
function continueEnding(g) {
  const p = g.turnOrder.find((i) => g.players[i].specials.includes('wild') && !g.players[i].wildType);
  if (p != null) {
    g.pending = { type: 'wildType', player: p };
    return;
  }
  g.pending = null;
  g.phase = 'ended';
  g.final = scoreGame(g);
  log(g, { type: 'end', winner: g.final.winner });
}

/** resolve { cardType }: el Marionetista retirado pasa a ser del tipo elegido. */
export function resolveWild(g, a) {
  rule(Object.hasOwn(CHARACTER_TYPES, a.cardType), 'Elige un tipo de personaje');
  g.players[g.pending.player].wildType = a.cardType;
  log(g, { type: 'wild', player: g.pending.player, cardType: a.cardType });
  continueEnding(g);
}
