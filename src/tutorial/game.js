import { createGame, OUTER_LOTS } from '../game/setup.ts';
import { act } from '../game/engine.ts';

/**
 * Partida del tutorial: tres jugadores, uno humano y dos de IA, con semilla fija. El humano es el jugador inicial
 * (coloca su Ikizama el primero) pero, a diferencia de una partida normal, elige el último personaje: las IA ya
 * tienen el suyo colocado, lejos de la salida, para que al humano le queden dos solares cercanos a la calle y dos cartas entre las que elegir.
 */

export const TUTORIAL_SEED = 2026;
const BOARD_IDS = ['yellow', 'blue', 'red'];

// Personajes iniciales y solares de las dos IA, en el orden en que eligen. Al humano le quedan el Vendedor de Algodón
// y el de Anteojos, y los solares exteriores de la izquierda.
const AI_PICKS = [
  { card: 'salt-seller', lot: 'lot-top-right-4' },
  { card: 'boiled-egg-seller', lot: 'lot-bottom-right-4' },
];

export function createTutorialGame() {
  let g = createGame({ players: BOARD_IDS.map((boardId) => ({ boardId, ai: true })), seed: TUTORIAL_SEED });
  g.players[g.starter].ai = false;
  g.pickOrder = [...g.pickOrder.slice(1), g.starter]; // las IA ya han elegido cuando empieza el tutorial
  for (const pick of AI_PICKS) g = act(g, { type: 'placeInitial', ...pick });
  return g;
}

/** Solares exteriores que dejan libres las IA. */
export const HUMAN_LOTS = OUTER_LOTS.filter((lot) => !AI_PICKS.some((p) => p.lot === lot));
