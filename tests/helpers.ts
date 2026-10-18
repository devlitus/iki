import { createGame, OUTER_LOTS, KOBUN_PER_PLAYER } from '../src/game/setup.ts';
import { act } from '../src/game/engine.ts';
import type { Game, IkizamaSlot } from '../src/types.ts';

export const BOARDS = ['yellow', 'blue', 'red', 'purple'];

/** Partida de n jugadores con los personajes iniciales ya puestos: lista para la fase A del mes 1. */
export function newGame(n = 3, seed = 7) {
  let g = createGame({ players: BOARDS.slice(0, n).map((boardId) => ({ boardId })), seed });
  const cards = [...g.initialCharacters];
  // Del último solar exterior hacia atrás: con 3 jugadores deja libre lot-top-left-1, que usan muchos tests.
  [...OUTER_LOTS].reverse().slice(0, n).forEach((lot, i) => {
    g = act(g, { type: 'placeInitial', card: cards[i], lot });
  });
  return g;
}

/** Copia con cambios: edit(g) modifica el borrador. */
export function tweak(g: Game, edit: (draft: Game) => unknown) {
  const copy = structuredClone(g);
  edit(copy);
  return copy;
}

/** Coloca los Ikizama: `slots[k]` es el espacio del k-ésimo jugador en el orden de colocación. */
export function placeAll(g: Game, slots: IkizamaSlot[]) {
  const order = [...g.order!];
  slots.forEach((slot) => (g = act(g, { type: 'placeIkizama', slot })));
  return { g, order };
}

/** Lleva la partida hasta el turno del jugador con ese espacio de Ikizama. */
export function turnOf(g: Game, slot: IkizamaSlot) {
  const all: IkizamaSlot[] = ['1-4', '1', '2', '3', '4'];
  const slots = [slot, ...all.filter((s) => s !== slot)].slice(0, g.players.length);
  g = placeAll(g, slots).g;
  if (g.turn!.slot === slot) return g;
  // El turno de ese espacio no es el primero: se salta a él sin jugar los anteriores.
  return tweak(g, (d) => {
    const i = d.players.findIndex((p) => p.ikizama === slot);
    d.turnList = [i, ...d.turnList!.filter((x) => x !== i)];
    d.turn = { index: 0, player: i, slot, step: 'b1', didShop: false, didChar: false };
  });
}

