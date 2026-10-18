import { ZONES_BY_ID, STREET_ENTRY } from '../data/zones.ts';
import { act, candidates, tryAct, whoseTurn, IKIZAMA_SLOTS } from '../game/engine.ts';
import { currentPicker, freeOuterLots } from '../game/setup.ts';
import { receive } from '../game/state.ts';
import { evaluateAgainstOthers } from './evaluate.ts';
import type { Action, ActionOf, Game, IkizamaSlot } from '../types.ts';

export type Effort = 'normal' | 'fast';
type Cfg = { hires: number; branch: number };
type Plan = { value: number; action: Action };

/**
 * Jugador de IA. Puro: `chooseAction(estado)` devuelve la siguiente acción del jugador al que le toca decidir, como
 * las que entiende `act` (engine.js). Para cada decisión prueba las jugadas posibles, mira unos pasos adelante dentro
 * de su turno y se queda con la que deja la mejor posición (evaluate.js).
 *
 * Esfuerzo: cuánto mira. `normal` para jugar; `fast` para las pruebas, que simulan partidas enteras.
 */

const EFFORT: Record<Effort, Cfg> = {
  normal: { hires: 4, branch: 3 }, // contrataciones que se estudian a fondo / primeras jugadas que se combinan con otra
  fast: { hires: 2, branch: 1 },
};

/** Jugador al que le toca decidir ahora, o null si la partida no espera a nadie. */
export function deciderOf(g: Game): number | null {
  if (g.phase === 'ended' || g.phase === 'ready') return null;
  if (g.phase === 'initial-characters') return currentPicker(g);
  return whoseTurn(g);
}

/** ¿Le toca a un jugador de IA? */
export function isAiTurn(g: Game): boolean {
  const p = deciderOf(g);
  return p != null && Boolean(g.players[p].ai);
}

/** Casillas que hay que recorrer desde `from` hasta `to` siguiendo la calle (la cola entra por STREET_ENTRY). */
function distance(from: string, to: string | undefined) {
  let pos = from;
  for (let steps = 0; steps <= 9; steps++) {
    if (pos === to) return steps;
    pos = pos.startsWith('queue-') ? STREET_ENTRY : ZONES_BY_ID[pos].next!;
  }
  return 9;
}

/** La casilla de la calle a cuyos puestos pertenece un solar. */
const cellOfLot = (lot: string) => Object.values(ZONES_BY_ID).find((z) => z.stalls?.includes(lot))?.id;

/** Lo cómodo que es un solar: cuanto más cerca del Oyakata, antes se activará el personaje que se ponga en él. */
function lotReach(g: Game, p: number, lot: string) {
  const from = g.players[p].oyakata;
  return from ? 1 / (1 + distance(from, cellOfLot(lot))) : 0;
}

const best = <T>(items: T[], score: (item: T) => number): T => items.reduce<T>((top, item) => (top == null || score(item) > score(top) ? item : top), null as T);

// --- Planificación del turno -----------------------------------------------------------------------

/** Fase de negocios: la mejor combinación de tienda y personaje (o terminar ya). Devuelve { value, action }. */
function planBusiness(g: Game, p: number, cfg: Cfg): Plan {
  const stay: Plan = { value: evaluateAgainstOthers(g, p), action: { type: 'endTurn' } };
  const firsts = candidates(g)
    .filter((a) => a.type !== 'endTurn')
    .map((action) => ({ action, state: tryAct(g, action) }))
    .filter((x) => x.state)
    .map((x) => ({ ...x, value: evaluateAgainstOthers(x.state!, p) }))
    .sort((a, b) => b.value - a.value);

  let top = stay;
  for (const first of firsts.slice(0, cfg.branch)) {
    // Con la tienda ya usada, solo queda un personaje (y al revés): se mira la mejor segunda jugada.
    const second = candidates(first.state!)
      .filter((a) => a.type !== 'endTurn')
      .map((action) => tryAct(first.state!, action))
      .filter(Boolean)
      .map((state) => evaluateAgainstOthers(state!, p));
    const value = Math.max(first.value, ...second);
    if (value > top.value) top = { value, action: first.action };
  }
  return top;
}

/** Fase de movimiento (o de colocación en Año Nuevo): elige según lo que podrá hacer al llegar. */
function planMove(g: Game, p: number, cfg: Cfg): Plan {
  const options = candidates(g).map((action) => ({ action, state: tryAct(g, action) })).filter((x) => x.state);
  return best(options.map((o) => ({ action: o.action, value: planBusiness(o.state!, p, cfg).value })), (o) => o.value);
}

/** Fase B1: ingresos o contratar. Estudia a fondo solo las contrataciones más prometedoras. */
function planStart(g: Game, p: number, cfg: Cfg): Plan {
  const options = candidates(g)
    .map((action) => ({ action, state: tryAct(g, action) }))
    .filter((x) => x.state)
    .map((o) => ({
      ...o,
      // Contratar solo sale a cuenta si el solar queda a mano: se premia la cercanía al Oyakata.
      quick: evaluateAgainstOthers(o.state!, p) + (o.action.type === 'hire' ? 2 * lotReach(g, p, o.action.lot) : 0),
    }));
  const income = options.find((o) => o.action.type === 'income');
  const hires = options.filter((o) => o.action.type === 'hire').sort((a, b) => b.quick - a.quick).slice(0, cfg.hires);
  return best([income, ...hires].filter(Boolean).map((o) => ({ action: o!.action, value: planMove(o!.state!, p, cfg).value })), (o) => o.value);
}

/** Mejor jugada del turno en curso. */
function planTurn(g: Game, p: number, cfg: Cfg): Plan {
  const { step } = g.turn!;
  if (step === 'b1') return planStart(g, p, cfg);
  if (step === 'business') return planBusiness(g, p, cfg);
  return planMove(g, p, cfg);
}

// --- Otras decisiones ------------------------------------------------------------------------------

/** Decisiones sueltas (comida, incendio, Comodín…): se prueban todas y se queda la que deja mejor posición. */
function chooseSimple(g: Game, p: number): Action {
  const options = candidates(g).map((action) => ({ action, state: tryAct(g, action) })).filter((x) => x.state);
  return best(options, (o) => evaluateAgainstOthers(o.state!, p)).action;
}

/** Paso 13: carta y solar iniciales. */
function chooseInitial(g: Game, p: number): Action {
  const options = g.initialCharacters.flatMap((card) => freeOuterLots(g).map((lot): ActionOf<'placeInitial'> => ({ type: 'placeInitial', card, lot })));
  return best(options, (a) => evaluateAgainstOthers(act(g, a), p) + lotReach(g, p, a.lot));
}

const ORDER_BONUS: Record<IkizamaSlot, number> = { '1-4': 0.3, 1: 0.6, 2: 0.4, 3: 0.2, 4: 0 };

/**
 * Fase A: dónde poner el Ikizama. Se simula el turno que tendría en cada espacio libre y se elige el que mejor sale,
 * con un pequeño extra por jugar antes (primer turno = primera elección de cartas).
 */
function chooseIkizama(g: Game, p: number, cfg: Cfg): Action {
  const taken = new Set(g.players.map((q) => q.ikizama));
  const options = IKIZAMA_SLOTS.filter((slot) => !taken.has(slot)).map((slot) => {
    const sim = structuredClone(g);
    sim.phase = 'actions';
    sim.players[p].ikizama = slot;
    sim.turnList = [p];
    sim.turn = { index: 0, player: p, slot, step: slot === '1-4' ? 'move' : 'b1', didShop: false, didChar: false };
    if (slot === '1-4') receive(sim, p, { mon: 1 });
    return { action: { type: 'placeIkizama' as const, slot }, value: planTurn(sim, p, cfg).value + ORDER_BONUS[slot] };
  });
  return best(options, (o) => o.value).action;
}

/** La siguiente acción del jugador de IA al que le toca (o null si no le toca a nadie). */
export function chooseAction(g: Game, { effort = 'normal' }: { effort?: Effort } = {}): Action | null {
  const p = deciderOf(g);
  if (p == null) return null;
  const cfg = EFFORT[effort];
  if (g.phase === 'initial-characters') return chooseInitial(g, p);
  if (g.pending) return chooseSimple(g, p);
  if (g.phase === 'ikizama') return chooseIkizama(g, p, cfg);
  return planTurn(g, p, cfg).action;
}
