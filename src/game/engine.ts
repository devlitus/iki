import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.ts';
import { ZONES_BY_ID, LOT_IDS, STREET, STREET_ENTRY, LAP_FROM } from '../data/zones.ts';
import { placeInitialCard, currentPlacer } from './setup.ts';
import { activateCharacter, activateShop } from './abilities.ts';
import { startEvent, resolvePending } from './events.ts';
import { startMonth, beginNewYearTurn, seasonOf } from './month.ts';
import { finishGame, resolveWild } from './ending.ts';
import { advanceFire, assertFreeLot, characterLots, gainXp, log, pay, receive, rule } from './state.ts';
import type { Action, ActionOf, ActionType, CharacterType, Game, IkizamaSlot, TurnStep } from '../types.ts';


/**
 * Motor de la partida (docs/plan-logica.md, fase 2). Puro: `act(estado, acción) → estado nuevo`; no toca el DOM
 * ni modifica el estado que recibe. Una jugada no válida lanza un Error y deja el estado como estaba.
 *
 * Fases (`game.phase`):
 *   'initial-characters' → cada jugador coloca su personaje inicial (setup.js)
 *   'ikizama'            → fase A: se coloca el Ikizama en el marcador, por orden de Extinción de Incendios
 *   'actions'            → fase B: turnos por orden del Ikizama; `game.turn` es el turno en curso
 *   'event'              → fase C: Evento del mes (Día de Pago, Incendio); solo se ve cuando espera una decisión
 *   'newyear'            → mes 13, Día de Año Nuevo: cada jugador coloca su Oyakata donde quiera y hace negocios
 *   'ended'              → partida terminada; `game.final` tiene la puntuación (scoring.js)
 *
 * Acciones (`{ type, … }`):
 *   placeInitial { card, lot }          paso 13 de la preparación
 *   placeIkizama { slot }               fase A: '1-4' | '1' | '2' | '3' | '4'
 *   income                              B1: +4 mons
 *   hire { card, lot }                  B1: contrata una carta de la fila en un solar libre
 *   move { base?, sandals?, bonus? }    B2: mueve el Oyakata (base 1-4 solo en el espacio '1-4')
 *   shop { …elección }                  B2: la tienda de la casilla (ver abilities.js)
 *   character { lot, …elección }        B2: activa un personaje de los puestos de la casilla
 *   endTurn                             B3: recupera el Ikizama y pasa el turno
 *   place { zone }                      mes 13: coloca el Oyakata en cualquier casilla de la calle
 *   resolve { drop? | use? | cardType? } contesta la decisión pendiente (`game.pending`: events.js, ending.js)
 */

export const IKIZAMA_SLOTS: IkizamaSlot[] = ['1-4', '1', '2', '3', '4'];
export const INCOME = 4;
export { seasonOf };

/** Aplica una acción. Devuelve el estado nuevo; lanza un Error si no es válida. */
export function act(game: Game, action: Action): Game {
  const handler = (Object.hasOwn(HANDLERS, action?.type) ? HANDLERS[action.type] : null) as Handler<ActionType> | null; // sin claves heredadas («constructor»…)
  rule(handler, `Acción desconocida: ${action?.type}`);
  const g = structuredClone(game);
  handler(g, action as ActionOf<ActionType>);
  return g;
}

/** Jugador al que le toca decidir ahora (o null si la partida no espera a nadie). */
export function whoseTurn(g: Game): number | null {
  if (g.pending) return g.pending.player;
  if (g.phase === 'ikizama') return currentPlacer(g);
  if (g.turn) return g.turn!.player;
  return null;
}

// --- Fases -------------------------------------------------------------------------------------

/** Fase B: turnos por orden del Ikizama, empezando por el más a la izquierda. */
function startActions(g: Game) {
  g.phase = 'actions';
  g.turnList = g.players
    .map((p, i) => ({ i, slot: IKIZAMA_SLOTS.indexOf(p.ikizama!) }))
    .sort((a, b) => a.slot - b.slot)
    .map((x) => x.i);
  beginTurn(g, 0);
}

function beginTurn(g: Game, index: number) {
  const player = g.turnList![index];
  const slot = g.players[player].ikizama;
  g.turn = { index, player, slot, step: slot === '1-4' ? 'move' : 'b1', didShop: false, didChar: false };
  if (slot === '1-4') receive(g, player, { mon: 1 }); // no contrata ni gana ingresos, pero cobra 1 mon
}

function endTurn(g: Game) {
  const { index, player } = g.turn!;
  g.players[player].ikizama = null; // B3
  if (g.phase === 'newyear') {
    if (index + 1 < g.turnList!.length) return beginNewYearTurn(g, index + 1);
    return finishGame(g);
  }
  if (index + 1 < g.turnList!.length) return beginTurn(g, index + 1);
  g.turn = null;
  startEvent(g);
}

// --- Acciones ----------------------------------------------------------------------------------

const inPhase = (g: Game, phase: Game['phase']) => rule(g.phase === phase, `No es la fase ${phase}`);

function inStep(g: Game, step: TurnStep) {
  rule(g.phase === 'actions' || g.phase === 'newyear', 'Ahora no se juegan acciones');
  rule(g.turn && !g.pending, 'Ahora no se juegan acciones'); // al final de la partida hay una decisión pendiente y ya no hay turno
  rule(g.turn!.step === step, `Ahora no toca ${step}`);
  return g.turn!.player;
}

type Handler<T extends ActionType> = (g: Game, a: ActionOf<T>) => void;

const HANDLERS: { [T in ActionType]: Handler<T> } = {

  placeInitial(g, a) {
    Object.assign(g, placeInitialCard(g, a.card, a.lot));
    if (g.phase === 'ready') startMonth(g);
  },

  start(g) {
    inPhase(g, 'ready');
    startMonth(g);
  },

  placeIkizama(g, a) {
    inPhase(g, 'ikizama');
    rule(IKIZAMA_SLOTS.includes(a.slot), `Espacio de Ikizama desconocido: ${a.slot}`);
    rule(!g.players.some((p) => p.ikizama === a.slot), `El espacio ${a.slot} ya está ocupado`);
    g.players[currentPlacer(g)!].ikizama = a.slot;
    if (currentPlacer(g) == null) startActions(g);
  },

  income(g) {
    const p = inStep(g, 'b1');
    receive(g, p, { mon: INCOME });
    log(g, { type: 'income', player: p });
    g.turn!.step = 'move';
  },

  hire(g, a) {
    const p = inStep(g, 'b1');
    const player = g.players[p];
    const entry = g.row.find((r) => r.card === a.card);
    rule(entry, `${a.card} no está en la fila`);
    assertFreeLot(g, a.lot);
    rule(player.kobun > 0, 'No tienes Kobun disponibles');
    const def = CHARACTERS_BY_ID[a.card];
    const discount = player.specials.includes('hire') ? 1 : 0;
    receive(g, p, { mon: entry.mons }); // los mons de la carta ayudan a pagarla
    pay(g, p, { mon: Math.max(0, def.cost! - discount) + ZONES_BY_ID[a.lot].extraCost! }, def.name);
    g.row = g.row.filter((r) => r !== entry);
    g.lots[a.lot] = { kind: 'character', card: a.card, owner: p, xp: 0 };
    player.kobun -= 1;
    advanceFire(g, p, def.fire);
    if (def.fire > 0 && player.buildings.includes('fire-tower')) receive(g, p, { iki: 3 });
    log(g, { type: 'hire', player: p, card: a.card, lot: a.lot });
    g.turn!.step = 'move';
  },

  move(g, a) {
    const p = inStep(g, 'move');
    const player = g.players[p];
    const { slot } = g.turn!;
    const base = slot === '1-4' ? a.base : Number(slot);
    rule(Number.isInteger(base) && base! >= 1 && base! <= 4, 'Elige entre 1 y 4 espacios');
    const sandals = a.sandals ?? 0;
    rule(Number.isInteger(sandals) && sandals >= 0, 'Sandalias no válidas');
    rule(!a.bonus || player.specials.includes('move'), 'No tienes la ficha «Mover +1»');
    pay(g, p, { sandal: sandals }, 'mover');

    // Desde la zona inicial el primer paso lleva a la calle sin dar la vuelta.
    let pos = player.oyakata!;
    let laps = 0;
    for (let i = base! + sandals + (a.bonus ? 1 : 0); i > 0; i--) {
      if (pos.startsWith('queue-')) pos = STREET_ENTRY;
      else {
        if (pos === LAP_FROM) laps += 1;
        pos = ZONES_BY_ID[pos].next!;
      }
    }
    player.oyakata = pos;
    // La vuelta se resuelve durante el movimiento, antes de hacer negocios.
    for (let i = 0; i < laps; i++) characterLots(g, p).forEach((lot) => gainXp(g, lot));
    log(g, { type: 'move', player: p, to: pos, laps });
    g.turn!.step = 'business';
  },

  place(g, a) {
    const p = inStep(g, 'place');
    rule(STREET.includes(a.zone), `${a.zone} no es una casilla de la calle`);
    g.players[p].oyakata = a.zone;
    log(g, { type: 'place', player: p, to: a.zone });
    g.turn!.step = 'business';
  },

  shop(g, a) {
    const p = inStep(g, 'business');
    rule(!g.turn!.didShop, 'Ya has usado la tienda este turno');
    activateShop(g, p, ZONES_BY_ID[g.players[p].oyakata!].shop!, a);
    g.turn!.didShop = true;
  },

  character(g, a) {
    const p = inStep(g, 'business');
    rule(!g.turn!.didChar, 'Ya has activado un personaje este turno');
    rule(ZONES_BY_ID[g.players[p].oyakata!].stalls!.includes(a.lot), 'Ese solar no está en los puestos de tu casilla');
    activateCharacter(g, p, a.lot, a);
    g.turn!.didChar = true;
  },

  endTurn(g) {
    inStep(g, 'business');
    endTurn(g);
  },

  resolve(g, a) {
    rule(g.pending, 'No hay ninguna decisión pendiente');
    if (g.pending.type === 'wildType') resolveWild(g, a);
    else resolvePending(g, a);
  },
};

// --- Jugadas legales ---------------------------------------------------------------------------

/** El estado tras `action`, o null si no es válida (para quien prueba muchas jugadas y no quiere aplicar cada una dos veces). */
export function tryAct(g: Game, action: Action): Game | null {
  try {
    return act(g, action);
  } catch {
    return null;
  }
}

/**
 * Todas las jugadas válidas ahora mismo, como acciones completas (la interfaz las usa para resaltar y los tests para
 * jugar partidas al azar). Se generan los candidatos y se descartan los que `act` rechaza, así la validación es una sola.
 */
export function legalActions(g: Game): Action[] {
  return candidates(g).filter((a) => {
    try {
      act(g, a);
      return true;
    } catch {
      return false;
    }
  });
}

/** Acciones que se prueban en cada momento (algunas pueden no ser válidas); `legalActions` se queda con las válidas. */
export function candidates(g: Game): Action[] {
  if (g.pending?.type === 'wildType') return (Object.keys(CHARACTER_TYPES) as CharacterType[]).map((cardType) => ({ type: 'resolve', cardType }));
  if (g.pending?.type === 'avoidFire') return [{ type: 'resolve', use: true }, { type: 'resolve', use: false }];
  if (g.pending?.type === 'food') return combinations(characterLots(g, g.pending.player), g.pending.drop).map((drop) => ({ type: 'resolve', drop }));
  if (g.phase === 'ikizama') return IKIZAMA_SLOTS.map((slot) => ({ type: 'placeIkizama', slot }));
  if (g.phase !== 'actions' && g.phase !== 'newyear') return [];
  if (g.turn!.step === 'place') return STREET.map((zone) => ({ type: 'place', zone }));
  const p = g.turn!.player;
  const player = g.players[p];

  if (g.turn!.step === 'b1') {
    const freeLots = LOT_IDS.filter((id) => !g.lots[id]);
    return [{ type: 'income' }, ...g.row.flatMap((r) => freeLots.map((lot) => ({ type: 'hire' as const, card: r.card, lot })))];
  }

  if (g.turn!.step === 'move') {
    const bases = g.turn!.slot === '1-4' ? [1, 2, 3, 4] : [undefined];
    const out: Action[] = [];
    for (const base of bases) {
      for (let sandals = 0; sandals <= player.resources.sandal; sandals++) {
        out.push({ type: 'move', base, sandals });
        if (player.specials.includes('move')) out.push({ type: 'move', base, sandals, bonus: true });
      }
    }
    return out;
  }

  const here = ZONES_BY_ID[player.oyakata!];
  const out: Action[] = [{ type: 'endTurn' }];
  if (!g.turn!.didShop) out.push(...shopCandidates(g, here.shop, p));
  if (!g.turn!.didChar) for (const lot of here.stalls!) if (g.lots[lot]?.kind === 'character') out.push(...characterCandidates(g, lot, p));
  return out;
}

const freeLotIds = (g: Game) => LOT_IDS.filter((id) => !g.lots[id]);

function shopCandidates(g: Game, shop: string | undefined, p: number): Action[] {
  const m = g.market;
  const own = characterLots(g, p);
  const pipes = [undefined, ...m.pipes];
  const bags = [undefined, ...m.bags];
  switch (shop) {
    case 'shop-sandals':
    case 'shop-rice':
    case 'shop-fire-tower':
      return [{ type: 'shop' }];
    case 'shop-tobacco':
      return pipes.flatMap((pipe) => bags.flatMap((bag) => (own.length ? own : [undefined]).map((target) => ({ type: 'shop', pipe, bag, target }))));
    case 'shop-pawn':
      return ['rice', 'sandal'].map((choice) => ({ type: 'shop', choice }));
    case 'shop-construction':
      return [{ type: 'shop', choice: 'rice' }, ...g.buildings.flatMap((building) => freeLotIds(g).map((lot) => ({ type: 'shop' as const, choice: 'build', building, lot })))];
    case 'shop-fish':
      return m.fish.map((fish) => ({ type: 'shop', fish }));
    case 'shop-exchange':
      return ['koban1', 'koban2', 'mons'].map((choice) => ({ type: 'shop', choice }));
    default:
      return [];
  }
}

function characterCandidates(g: Game, lot: string, p: number): Action[] {
  const def = CHARACTERS_BY_ID[g.lots[lot].card];
  const base = { type: 'character' as const, lot };
  switch (def.ability.kind) {
    case 'xp':
      return characterLots(g, p).map((target) => ({ ...base, target }));
    case 'build':
      return g.buildings.flatMap((building) => freeLotIds(g).map((l) => ({ ...base, building, buildLot: l })));
    case 'swap': {
      const all = Object.keys(g.lots).filter((id) => g.lots[id].kind === 'character');
      return all.flatMap((x, i) => all.slice(i + 1).map((y) => ({ ...base, lots: [x, y] })));
    }
    default:
      return [base];
  }
}

/** Todas las formas de elegir `k` elementos de `list`. */
function combinations<T>(list: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return list.flatMap((x, i) => combinations(list.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}
