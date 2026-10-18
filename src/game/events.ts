import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { NAGAYAS, HARMONY_GROUPS, ZONES_BY_ID } from '../data/zones.ts';
import { startMonth, startNewYear, seasonOf } from './month.ts';
import { createRng } from './random.ts';
import { characterLots, log, receive, removeLot, rule, salaryOf, toCost } from './state.ts';
import type { ActionOf, Amount, FireEvent, Game, PaydayEvent, Pending } from '../types.ts';


/**
 * Fase C — Evento del mes (docs/reglas.md, pp. 7-9). Se resuelve sola hasta que hace falta una decisión de un
 * jugador, que queda en `game.pending` y se contesta con la acción `resolve`:
 *   { type: 'food', player, drop }       comida insuficiente → resolve { drop: [solares] } (exactamente `drop`)
 *   { type: 'avoidFire', player, lot }   un personaje va a arder → resolve { use: true | false }
 */

export const PAYDAY_MONTHS = [3, 6, 9, 12];
/** Fuerza del Incendio al final de cada mes en que ocurre (calendario del tablero). */
export const FIRE_STRENGTH: Record<number, number> = { 5: 5, 8: 8, 11: 10 };
export const PAYDAY_RICE = 1; // arroz por personaje en el tablero
const FARM_IKI = 2;
const VILLA_MONS = 2;

/** Empieza el Evento del mes que acaba de terminar la fase B. */
export function startEvent(g: Game) {
  g.phase = 'event';
  if (PAYDAY_MONTHS.includes(g.month)) g.event = { kind: 'payday', stage: 'start', who: 0 };
  else if (FIRE_STRENGTH[g.month]) g.event = { kind: 'fire', stage: 'start' };
  else g.event = { kind: 'plain' };
  continueEvent(g);
}

/** Sigue el Evento desde donde se quedó (también tras cada decisión). */
export function continueEvent(g: Game) {
  const run = { plain: plainEvent, payday, fire }[g.event!.kind];
  run(g);
}

/** Cierra el Evento: el calendario avanza y empieza el mes siguiente (o el Día de Año Nuevo). */
function finishEvent(g: Game) {
  g.event = null;
  g.pending = null;
  g.month += 1;
  if (g.month <= 12) startMonth(g);
  else startNewYear(g);
}

/** +1 mon en cada carta que quede junto al tablero. */
const addMonsToRow = (g: Game) => g.row.forEach((r) => (r.mons += 1));

function plainEvent(g: Game) {
  addMonsToRow(g);
  finishEvent(g);
}

// --- Día de Pago -------------------------------------------------------------------------------

function payday(g: Game) {
  const ev = g.event as PaydayEvent;
  if (ev.stage === 'start') {
    changeSeason(g);
    paySalaries(g);
    harmonyBonus(g);
    ev.stage = 'food';
  }
  if (ev.stage === 'food') {
    while (ev.who < g.turnOrder.length) {
      const p = g.turnOrder[ev.who];
      const chars = characterLots(g, p);
      const rice = g.players[p].resources.rice;
      if (rice >= chars.length || rice === 0) feed(g, p, chars, chars.slice(rice)); // sin elección posible
      else {
        g.pending = { type: 'food', player: p, drop: chars.length - rice };
        return;
      }
      ev.who += 1;
    }
    perks(g);
    finishEvent(g);
  }
}

/** Cambio de estación: fuera la fila y el mercado (mes 12: el mercado de Invierno se queda y se recogen los Oyakata). */
function changeSeason(g: Game) {
  g.row = []; // las cartas sin contratar salen de la partida y sus mons vuelven a la reserva
  if (g.month === 12) g.players.forEach((p) => (p.oyakata = null));
  else {
    const next = seasonOf(g.month + 1).id;
    g.market = g.marketFaceDown[next]!;
    delete g.marketFaceDown[next];
  }
}

/** Paso 1: cada personaje cobra la casilla donde está su Kobun; los retirados, el salario máximo. */
function paySalaries(g: Game) {
  g.players.forEach((player, p) => {
    const gain: Amount[] = [];
    for (const lotId of characterLots(g, p)) gain.push(...salaryOf(CHARACTERS_BY_ID[g.lots[lotId].card], g.lots[lotId].xp));
    for (const card of player.retired) gain.push(...CHARACTERS_BY_ID[card].salary.at(-1)!);
    const total = toCost(gain);
    receive(g, p, total);
    log(g, { type: 'salary', player: p, gain: total });
  });
}

/**
 * Paso 2, Bonificación por Armonía: en cada grupo y por cada tipo con 2 o más cartas, cada jugador recibe
 * (sus cartas de ese tipo) × (todas las de ese tipo en el grupo) IKI. Las esquinas puntúan en dos grupos.
 */
export function harmonyGains(g: Game) {
  const gains = g.players.map(() => 0);
  for (const group of HARMONY_GROUPS) {
    const byType: Record<string, { total: number; owners: Record<number, number> }> = {};
    for (const lotId of group) {
      const lot = g.lots[lotId];
      if (lot?.kind !== 'character') continue;
      const type = CHARACTERS_BY_ID[lot.card].type;
      byType[type] ??= { total: 0, owners: {} };
      byType[type].total += 1;
      byType[type].owners[lot.owner] = (byType[type].owners[lot.owner] ?? 0) + 1;
    }
    for (const { total, owners } of Object.values(byType)) {
      if (total < 2) continue;
      for (const [owner, n] of Object.entries(owners)) gains[owner as unknown as number] += n * total; // claves de objeto: el índice como texto
    }
  }
  return gains;
}

export function harmonyBonus(g: Game) {
  harmonyGains(g).forEach((iki, p) => {
    if (!iki) return;
    receive(g, p, { iki });
    log(g, { type: 'harmony', player: p, iki });
  });
}

/** Paso 3: se paga 1 arroz por personaje que se queda; los `dropped` se eliminan y su Kobun vuelve. */
function feed(g: Game, p: number, chars: string[], dropped: string[]) {
  for (const lot of dropped) {
    const { card } = removeLot(g, lot);
    log(g, { type: 'starve', player: p, card });
  }
  const fed = chars.length - dropped.length;
  g.players[p].resources.rice -= fed * PAYDAY_RICE;
  g.players[p].fed = fed;
  log(g, { type: 'food', player: p, fed, dropped: dropped.length });
}

/** Granja y Villa Imperial: habilidades de final de estación (tras alimentar). */
function perks(g: Game) {
  g.players.forEach((player, p) => {
    if (player.buildings.includes('farm') && player.fed) receive(g, p, { iki: FARM_IKI * player.fed });
    if (player.buildings.includes('imperial-villa')) {
      const counts: Record<string, number> = {};
      for (const card of [...characterLots(g, p).map((l) => g.lots[l].card), ...player.retired]) {
        const type = CHARACTERS_BY_ID[card].type;
        counts[type] = (counts[type] ?? 0) + 1;
      }
      const most = Math.max(0, ...Object.values(counts));
      if (most) receive(g, p, { mon: VILLA_MONS * most });
    }
    delete player.fed;
  });
}

// --- Incendio ----------------------------------------------------------------------------------

/**
 * El jugador con más Extinción roba una loseta y el fuego entra por el solar exterior de su Nagaya y avanza hacia el
 * centro. En cada solar la fuerza es la del mes + el modificador impreso (0, −1, −2, −3).
 */
function fire(g: Game) {
  const ev = g.event as FireEvent;
  if (ev.stage === 'start') {
    const rng = createRng(g.rng!);
    g.fireTiles = rng.shuffle(g.fireTiles);
    ev.tile = g.fireTiles[0] as string;
    g.fireTiles = rng.shuffle(g.fireTiles); // la loseta vuelve a mezclarse con las demás
    g.rng = rng.state();
    ev.nagaya = NAGAYAS.find((n) => n.lots[0] === ev.tile)!.id;
    ev.index = 0;
    ev.stage = 'spread';
    log(g, { type: 'fire-start', player: g.fireStack[0], nagaya: ev.nagaya, strength: FIRE_STRENGTH[g.month] });
  }
  spread(g);
}

function spread(g: Game) {
  const ev = g.event as FireEvent;
  const lots = NAGAYAS.find((n) => n.id === ev.nagaya)!.lots;
  for (; ev.index! < lots.length; ev.index!++) {
    const lotId = lots[ev.index!];
    const lot = g.lots[lotId];
    if (!lot) continue; // solar vacío: el fuego pasa al siguiente con 1 menos
    const strength = FIRE_STRENGTH[g.month] + ZONES_BY_ID[lotId].fire!;
    if (g.players[lot.owner].fire >= strength) {
      log(g, { type: 'fire-stopped', player: lot.owner, lot: lotId });
      break;
    }
    if (lot.kind === 'character' && g.players[lot.owner].specials.includes('avoid-fire')) {
      g.pending = { type: 'avoidFire', player: lot.owner, lot: lotId };
      return; // espera la decisión del dueño
    }
    burn(g, lotId);
  }
  addMonsToRow(g);
  finishEvent(g);
}

function burn(g: Game, lotId: string) {
  const lot = removeLot(g, lotId);
  log(g, { type: 'burned', player: lot.owner, card: lot.card, lot: lotId });
}

// --- Decisiones --------------------------------------------------------------------------------

/** Contesta la decisión pendiente y sigue con el Evento. */
export function resolvePending(g: Game, a: ActionOf<'resolve'>) {
  const pending = g.pending as Exclude<Pending, { type: 'wildType' }> | null; // el Comodín lo resuelve ending.js
  rule(pending, 'No hay ninguna decisión pendiente');
  g.pending = null;
  if (pending.type === 'food') {
    const drop = a.drop ?? [];
    const own = characterLots(g, pending.player);
    rule(drop.length === pending.drop && new Set(drop).size === drop.length && drop.every((l) => own.includes(l)),
      `Elige ${pending.drop} de tus personajes para eliminar`);
    feed(g, pending.player, own, drop);
    (g.event as PaydayEvent).who += 1;
  } else {
    rule(typeof a.use === 'boolean', 'Elige si usas «Evitar un incendio»');
    if (a.use) {
      const specials = g.players[pending.player].specials;
      specials.splice(specials.indexOf('avoid-fire'), 1);
      log(g, { type: 'fire-avoided', player: pending.player, lot: pending.lot });
    } else burn(g, pending.lot);
    (g.event as FireEvent).index! += 1;
  }
  continueEvent(g);
}
