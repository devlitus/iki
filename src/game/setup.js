import { createRng } from './random.js';
import { SEASONS, BUILDINGS } from '../data/decks.js';
import { CHARACTERS } from '../data/characters.js';
import { ZONES } from '../data/zones.js';
import { seasonMarket } from '../data/market.js';

/**
 * Preparación de la partida (docs/reglas.md, p. 2). Lógica pura: recibe datos y devuelve el estado como
 * objeto plano (se puede guardar en JSON). Nada de DOM aquí.
 */

/** Asientos alrededor del tablero en sentido horario visto desde arriba. */
export const GAME_VERSION = 3;
export const MIN_PLAYERS = 3; // falta el lado de 2 jugadores del tablero
export const MAX_PLAYERS = 4;

export const STARTING_RESOURCES = { mon: 8, rice: 1, sandal: 1, wood: 0, koban: 0 };
export const KOBUN_PER_PLAYER = 4;
export const BUILDINGS_IN_GAME = 6;
export const INITIAL_CHARACTERS = CHARACTERS.filter((c) => c.season === 'initial').map((c) => c.id);

/** Solares exteriores (con estampado, origen del incendio): donde va el personaje inicial (paso 13B). */
export const OUTER_LOTS = ZONES.filter((z) => z.group === 'lots' && z.fire === 0).map((z) => z.id);

/** Losetas de Incendio: una por Nagaya, identificadas por su solar exterior. */
const FIRE_TILES = OUTER_LOTS;

/** Fichas de mercado por estación (paso 5): 2 pescados, 2 pipas y 2 bolsas de tabaco (ids de data/market.js). */
const marketTokens = (season) => {
  const { fish, pipe, bag } = seasonMarket(season);
  return { fish, pipes: pipe, bags: bag };
};

/**
 * Tirada para decidir el jugador inicial: cada jugador tira un dado y empieza el más alto. Si varios
 * empatan en la cifra más alta, solo ellos vuelven a tirar. Devuelve las tiradas de cada jugador.
 */
export function rollForStarter(rng, n) {
  const rolls = Array.from({ length: n }, () => [rng.roll()]);
  let tied = [...rolls.keys()];
  for (;;) {
    const top = Math.max(...tied.map((i) => rolls[i].at(-1)));
    tied = tied.filter((i) => rolls[i].at(-1) === top);
    if (tied.length === 1) return { rolls, starter: tied[0] };
    for (const i of tied) rolls[i].push(rng.roll());
  }
}

/**
 * Crea una partida preparada hasta el paso 12. El paso 13 (personajes iniciales) lo hacen los jugadores
 * con placeInitialCard().
 *
 * @param {{ boardId: string }[]} players  en orden de asiento, en sentido horario.
 * @param {number} seed
 */
export function createGame({ players, seed }) {
  const n = players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`IKI se prepara con ${MIN_PLAYERS}-${MAX_PLAYERS} jugadores`);
  const rng = createRng(seed);

  // Paso 10: jugador inicial. Orden horario desde él.
  const { rolls, starter } = rollForStarter(rng, n);
  const turnOrder = Array.from({ length: n }, (_, k) => (starter + k) % n);
  // Paso 13: se elige en sentido antihorario, empezando por el jugador a la derecha del inicial,
  // así que el inicial elige el último. [pendiente de confirmar en el reglamento]
  const pickOrder = [...turnOrder.slice(1).reverse(), starter];

  const buildings = rng.shuffle(BUILDINGS.map((b) => b.id));
  const [, ...laterSeasons] = SEASONS;

  return {
    version: GAME_VERSION,
    seed,
    rng: rng.state(), // estado del generador: el motor lo continúa desde aquí
    phase: 'initial-characters',
    month: 1, // paso 2
    players: players.map((p, i) => ({
      boardId: p.boardId,
      rolls: rolls[i],
      resources: { ...STARTING_RESOURCES }, // paso 9
      kobun: KOBUN_PER_PLAYER, // Kobun libres en el tablero de jugador
      ikizama: null, // casilla del marcador de Ikizama; null = en su tablero
      specials: [], // fichas especiales: move, avoid-fire, wild, hire
      fish: [], // un Pescado por estación, como máximo 4
      pipes: [],
      tobacco: [],
      retired: [], // personajes retirados (ids de carta), en las columnas de su tablero
      buildings: [], // edificios construidos (ids)
      fire: 0, // paso 11
      iki: 0, // paso 12
      oyakata: `queue-${turnOrder.indexOf(i) + 1}`, // paso 10
    })),
    starter,
    turnOrder,
    fireStack: turnOrder, // paso 11: de arriba abajo, el inicial arriba
    fireTiles: rng.shuffle(FIRE_TILES), // paso 4
    market: marketTokens(SEASONS[0].id), // paso 5A
    marketFaceDown: Object.fromEntries(laterSeasons.map((s) => [s.id, marketTokens(s.id)])), // paso 5B
    buildings: buildings.slice(0, BUILDINGS_IN_GAME), // paso 6
    buildingsBox: buildings.slice(BUILDINGS_IN_GAME),
    decks: Object.fromEntries(SEASONS.map((s) => [s.id, rng.shuffle(s.cards)])), // paso 8
    row: [],
    initialCharacters: [...INITIAL_CHARACTERS], // paso 13A
    pickOrder,
    lots: {}, // lotId → { kind: 'character' | 'building', card, owner, xp }
    log: [],
    pending: null, // decisión que espera a un jugador (ver events.js)
    event: null, // Evento del mes en curso
  };
}

/** Jugador al que le toca elegir personaje inicial, o null si ya han elegido todos. */
export function currentPicker(game) {
  if (game.phase !== 'initial-characters') return null;
  return game.pickOrder[pickedCount(game)] ?? null;
}

/**
 * Jugador que está jugando: durante el paso 13 el que elige personaje; después, el del turno.
 * Aún no hay turnos, así que tras la preparación es el jugador inicial.
 */
export const activePlayer = (game) => currentPicker(game) ?? game.turn?.player ?? currentPlacer(game) ?? game.turnOrder[0];

/** Fase A: jugador al que le toca colocar su Ikizama, o null fuera de esa fase. */
export function currentPlacer(game) {
  if (game.phase !== 'ikizama') return null;
  return game.order.find((i) => game.players[i].ikizama == null) ?? null;
}

const pickedCount = (game) => Object.values(game.lots).filter((l) => l.initial).length;

/** Solares exteriores que siguen libres. */
export const freeOuterLots = (game) => OUTER_LOTS.filter((id) => !game.lots[id]);

/**
 * Paso 13B: el jugador de turno coloca un personaje inicial en un solar exterior libre con un Kobun en
 * el primer espacio de experiencia. Devuelve un estado nuevo; lanza un error si la jugada no es válida.
 */
export function placeInitialCard(game, cardId, lotId) {
  const player = currentPicker(game);
  if (player == null) throw new Error('Ya se han colocado todos los personajes iniciales');
  if (!game.initialCharacters.includes(cardId)) throw new Error(`${cardId} no está disponible`);
  if (!freeOuterLots(game).includes(lotId)) throw new Error(`${lotId} no es un solar exterior libre`);

  const players = game.players.map((p, i) => (i === player ? { ...p, kobun: p.kobun - 1 } : p));
  const lots = { ...game.lots, [lotId]: { kind: 'character', card: cardId, owner: player, xp: 0, initial: true } };
  let initialCharacters = game.initialCharacters.filter((id) => id !== cardId);
  let phase = game.phase;
  if (Object.values(lots).filter((l) => l.initial).length === game.players.length) {
    initialCharacters = []; // con 2-3 jugadores, las sobrantes vuelven a la caja
    phase = 'ready';
  }
  return { ...game, players, lots, initialCharacters, phase };
}
