import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.ts';
import { BUILDINGS_BY_ID } from '../data/decks.ts';
import { MARKET_BY_ID, describeToken } from '../data/market.ts';
import { ZONES_BY_ID, STREET, LOT_IDS } from '../data/zones.ts';
import { act, whoseTurn, seasonOf, IKIZAMA_SLOTS } from '../game/engine.ts';
import { FIRE_STRENGTH } from '../game/events.ts';
import { buildCost, characterLots } from '../game/state.ts';
import { abilityText, cardName, chips, costChips, costText, isWaiting, logByMonth, playerColor, playerName, shopName, waitingText, who } from './format.ts';
import type { Action, ActionOf, CharacterType, Game, IkizamaSlot, MarketToken, Target } from '../types.ts';


/** Lo que el jugador va eligiendo antes de confirmar (ver el comentario de abajo). */
export type Ui = {
  hire?: string | null;
  base?: number;
  sandals?: number;
  bonus?: boolean;
  building?: { via: string; lot?: string; building: string } | null;
  pipe?: string | null;
  bag?: string | null;
  target?: string | null;
  swapA?: string | null;
  swapB?: string | null;
  drop?: string[];
  error?: string | null;
  [key: string]: unknown;
};
export type Ctx = {
  ui: Ui;
  set: (patch: Partial<Ui>) => void;
  dispatch: (action: Action) => void;
  undo: () => void;
  canUndo?: boolean;
  game?: Game;
  openFinal?: () => void;
  openLog?: () => void;
};

/**
 * Panel de turno (columna izquierda) y objetivos del tablero. Solo pinta el estado y manda acciones: lo que el
 * jugador va eligiendo antes de confirmar vive en `ui` (lo guarda main.js) y las acciones las valida el motor.
 *
 * `ctx` = { ui, set(patch), dispatch(action), undo(), canUndo }
 *   ui: hire (carta de la fila), base, sandals, bonus, building ({ via, lot?, building }), pipe, bag, target,
 *       swapA, swapB, drop (solares elegidos para la comida), error.
 */

const PHASE: Record<string, string> = { ikizama: 'A · Camino de la vida', actions: 'B · Acciones', event: 'C · Evento', newyear: 'Día de Año Nuevo', ended: 'Fin de la partida' };

/** ¿Acepta el motor esta acción ahora? (valida con el propio motor, así no se repiten las reglas aquí). */
export function isLegal(game: Game, action: Action) {
  try {
    act(game, action);
    return true;
  } catch {
    return false;
  }
}

const freeLots = (game: Game) => LOT_IDS.filter((id) => !game.lots[id]);

/** Solares libres donde se puede hacer `make(lot)` ahora. */
const legalLots = (game: Game, make: (lot: string) => Action) => freeLots(game).filter((lot) => isLegal(game, make(lot)));

/** Coste en mons de contratar `card` en `lot` (ya descontados los mons de la carta), para los títulos. */
function hireCost(game: Game, p: number, card: string, lot: string) {
  const entry = game.row.find((r) => r.card === card)!;
  const discount = game.players[p].specials.includes('hire') ? 1 : 0;
  return Math.max(0, CHARACTERS_BY_ID[card].cost! - discount) + ZONES_BY_ID[lot].extraCost! - entry.mons;
}

/** Un coste de contratar: si los mons de la carta lo superan, no cuesta nada y sobran mons. */
const hireCostText = (cost: number) => cost > 0 ? `${cost} mons` : cost < 0 ? `gratis, te quedas ${-cost} mons` : 'gratis';

/** Cartas de la fila que el jugador de turno puede contratar en algún solar libre. */
export function hireableCards(game: Game): Set<string> {
  if (game.phase !== 'actions' || game.turn!.step !== 'b1' || isWaiting(game)) return new Set();
  const lots = freeLots(game);
  return new Set(game.row.filter((r) => lots.some((lot) => isLegal(game, { type: 'hire', card: r.card, lot }))).map((r) => r.card));
}

// --- Objetivos del tablero ----------------------------------------------------------------------

/** Zonas del tablero que se pueden pulsar ahora: [{ zone, title, onClick }]. */
export function boardTargets(game: Game, { ui, dispatch }: Pick<Ctx, 'ui' | 'dispatch'>): Target[] {
  if (isWaiting(game)) return []; // juega la IA u otra persona: el tablero no se pulsa
  const p = whoseTurn(game);
  if (game.phase === 'ikizama') {
    return IKIZAMA_SLOTS.filter((slot) => isLegal(game, { type: 'placeIkizama', slot })).map((slot) => ({
      zone: `turn-${slot}`, title: `Colocar el Ikizama en ${slot}`, onClick: () => dispatch({ type: 'placeIkizama', slot }),
    }));
  }
  if (game.pending) return [];
  if (game.phase === 'newyear' && game.turn!.step === 'place') {
    return STREET.map((zone) => ({ zone, title: `Colocar el Oyakata en ${ZONES_BY_ID[zone].label} · ${shopName(zone)}`, onClick: () => dispatch({ type: 'place', zone }) }));
  }
  if (game.phase !== 'actions' && game.phase !== 'newyear') return [];

  if (ui.hire && game.turn!.step === 'b1') {
    return legalLots(game, (lot) => ({ type: 'hire', card: ui.hire!, lot })).map((lot) => ({
      zone: lot, title: `Contratar a ${cardName(ui.hire!)} aquí · ${hireCostText(hireCost(game, p!, ui.hire!, lot))}`,
      onClick: () => dispatch({ type: 'hire', card: ui.hire!, lot }),
    }));
  }
  if (ui.building?.building && game.turn!.step === 'business') {
    const { via, lot: charLot, building } = ui.building;
    const make = (lot: string): Action => (via === 'shop' ? { type: 'shop', choice: 'build', building, lot } : { type: 'character', lot: charLot!, building, buildLot: lot });
    return legalLots(game, make).map((lot) => ({ zone: lot, title: `Construir ${cardName(building)} aquí`, onClick: () => dispatch(make(lot)) }));
  }
  return [];
}

// --- Panel --------------------------------------------------------------------------------------

export function renderTurnPanel(el: HTMLElement, game: Game, ctx: Ctx) {
  const { ui } = ctx;
  const p = whoseTurn(game);
  const season = seasonOf(game.month);
  const header = `
    <header class="turn-head">
      <span class="label">Mes ${game.month}/13 · ${season.name}</span>
      <h2>${PHASE[game.phase] ?? ''}</h2>
      ${p != null ? `<p class="turn-who" style="--player-color:${playerColor(game, p)}">Juega ${who(game, p)}${game.turn?.slot ? ` · Ikizama ${game.turn.slot}` : ''}</p>` : ''}
      ${fireWarning(game, p)}
    </header>`;

  const waiting = isWaiting(game);
  const body = waiting ? `<p class="ai-thinking" role="status">${waitingText(game, p!)}</p>` : game.pending ? pendingBody(game, ctx) : ({ ikizama: ikizamaBody, actions: actionsBody, newyear: actionsBody, event: () => '', ended: endedBody } as Partial<Record<string, (game: Game, ctx: Ctx) => string>>)[game.phase]?.(game, ctx) ?? '';

  el.innerHTML = `
    ${header}
    ${ui.error ? `<p class="turn-error" role="alert">${ui.error}</p>` : ''}
    <div class="turn-body">${body}</div>
    ${ctx.canUndo && !waiting ? '<button type="button" class="btn btn-sm" data-do="undo">↶ Deshacer</button>' : ''}
    <details class="turn-log" open>
      <summary class="label">Registro</summary>
      ${recentLog(game)}
      ${btn('Ver todo el registro', 'data-do="log"', { cls: 'btn-sm' })}
    </details>`;
}

/**
 * En los meses de Incendio, aviso de que al final del mes habrá uno y de su fuerza, con el nivel de Extinción de quien
 * juega (o, si juega la IA, de las personas), para elegir Ikizama y solar sabiéndolo.
 */
function fireWarning(game: Game, p: number | null) {
  const strength = FIRE_STRENGTH[game.month];
  if (!strength || (game.phase !== 'ikizama' && game.phase !== 'actions')) return '';
  const humans = p != null && !game.players[p].ai ? [p] : game.players.flatMap((q, i) => (q.ai ? [] : [i]));
  const levels = humans.map((q) => `${who(game, q)}: ${game.players[q].fire}`).join(' · ');
  return `<p class="fire-warning"><span aria-hidden="true">🔥</span> Incendio al final del mes · fuerza <b>${strength}</b>
    ${levels ? `<br><span>Extinción de ${levels}</span>` : ''}</p>`;
}

/** Lo jugado en el mes en curso y, mientras este apenas ha empezado, también en el anterior (lo último, arriba). */
const RECENT_MIN = 4;
function recentLog(game: Game) {
  const played = game.log.filter((e) => e.type !== 'month');
  const now = played.filter((e) => e.month === game.month).length;
  const from = now >= RECENT_MIN ? game.month : game.month - 1;
  return logByMonth(game, played.filter((e) => e.month >= from));
}

const btn = (label: string | number, attrs: string, { disabled = false, cls = '' } = {}) =>
  `<button type="button" class="btn ${cls}" ${attrs}${disabled ? ' disabled' : ''}>${label}</button>`;

/** Botón con la imagen de una ficha o carta; `zoom` es la imagen grande que sale al pasar el ratón. */
const picture = (src: string, label: string, attrs: string, { disabled = false, selected = false, zoom = src } = {}) =>
  `<button type="button" class="pick${selected ? ' selected' : ''}" ${attrs} data-zoom="${zoom}" title="${label}"${disabled ? ' disabled' : ''}>
    <img src="${src}" alt="${label}" draggable="false"></button>`;

// --- Fase A -------------------------------------------------------------------------------------

function ikizamaBody(game: Game, { ui }: Ctx) {
  const p = whoseTurn(game);
  const taken = (slot: string) => game.players.findIndex((q) => q.ikizama === slot);
  return `
    <p>Elige un espacio del marcador de Ikizama. El de la izquierda juega primero; «1-4» no contrata ni cobra ingresos, pero da 1 mon y deja elegir de 1 a 4 pasos.</p>
    <div class="slots">${IKIZAMA_SLOTS.map((slot) => {
      const owner = taken(slot);
      return btn(owner >= 0 ? `${slot} · ${playerName(game, owner)}` : slot, `data-do="ikizama" data-slot="${slot}"`,
        { disabled: owner >= 0 || p == null, cls: 'slot-btn' });
    }).join('')}</div>`;
}

// --- Fase B -------------------------------------------------------------------------------------

function actionsBody(game: Game, ctx: Ctx) {
  const { ui } = ctx;
  const step = game.turn!.step;
  if (step === 'b1') return b1Body(game, ctx);
  if (step === 'move') return moveBody(game, ctx);
  if (step === 'place') {
    return `<p>Coloca tu Oyakata en cualquier casilla de la calle (pulsa el tablero o elige aquí).</p>
      <div class="zone-list">${STREET.map((z) => btn(`${ZONES_BY_ID[z].label} · ${shopName(z)}`, `data-do="place" data-zone="${z}"`)).join('')}</div>`;
  }
  return businessBody(game, ctx);
}

function b1Body(game: Game, { ui }: Ctx) {
  const p = game.turn!.player;
  const def = ui.hire && CHARACTERS_BY_ID[ui.hire];
  const lots = ui.hire ? legalLots(game, (lot) => ({ type: 'hire', card: ui.hire!, lot })) : [];
  let hint = 'Elige una carta de la fila para contratarla.';
  if (!hireableCards(game).size) hint = 'No puedes contratar a nadie de la fila (mons, Kobun o solares libres): elige Ingresos.';
  if (def) hint = lots.length ? `Contratar a <b>${def.name}</b>: pulsa un solar libre del tablero. Los solares de las esquinas cuestan 2 mons más.`
    : `No puedes contratar a ${def.name} ahora (mons, Kobun o solares).`;
  return `
    <p>Tu Ikizama te deja elegir una de las dos acciones:</p>
    ${btn(`Ingresos ${chips([{ res: 'mon', n: 4 }])}`, 'data-do="income"', { cls: 'wide' })}
    <p class="muted">${hint}</p>
    ${def ? '' : '<button type="button" class="btn mobile-only" data-open-drawer="side">Ver la fila de personajes</button>'}
    ${ui.hire ? btn('Cancelar contratación', 'data-do="cancel"', { cls: 'btn-sm' }) : ''}`;
}

function moveBody(game: Game, { ui }: Ctx) {
  const p = game.turn!.player;
  const player = game.players[p];
  const choose = game.turn!.slot === '1-4';
  const base = ui.base ?? 1;
  const sandals = Math.min(ui.sandals ?? 0, player.resources.sandal);
  const action: Action = { type: 'move', base: choose ? base : undefined, sandals, bonus: ui.bonus || undefined };

  let preview = '';
  try {
    const next = act(game, action);
    const to = next.players[p].oyakata!;
    const laps = next.log.at(-1)!.laps as number;
    const here = ZONES_BY_ID[to];
    const stalls = here.stalls!.map((l) => next.lots[l]).filter((l) => l?.kind === 'character').map((l) => cardName(l.card));
    preview = `<p class="preview">Llegas a <b>${here.label}</b> · ${shopName(to)}${laps ? ` · <b>+${laps} experiencia</b> a todos tus personajes` : ''}
      ${stalls.length ? `<br><span class="muted">Puestos: ${stalls.join(', ')}</span>` : ''}</p>`;
  } catch (e) {
    preview = `<p class="turn-error">${(e as Error).message}</p>`;
  }

  const total = (choose ? base : Number(game.turn!.slot)) + sandals + (ui.bonus ? 1 : 0);
  return `
    <p>Mueve tu Oyakata en el sentido de las flechas.</p>
    ${choose ? `<div class="stepper"><span>Espacios</span>${[1, 2, 3, 4].map((n) => btn(n, `data-do="base" data-n="${n}"`, { cls: n === base ? 'on' : '' })).join('')}</div>`
      : `<p class="muted">Tu Ikizama marca ${game.turn!.slot} espacio(s).</p>`}
    <div class="stepper"><span>Sandalias ${chips([{ res: 'sandal', n: sandals }])} / ${player.resources.sandal}</span>
      ${btn('−', 'data-do="sandals" data-d="-1"', { disabled: sandals <= 0 })}${btn('+', 'data-do="sandals" data-d="1"', { disabled: sandals >= player.resources.sandal })}</div>
    ${player.specials.includes('move') ? `<label class="check"><input type="checkbox" data-do="bonus"${ui.bonus ? ' checked' : ''}> Usar «Mover +1»</label>` : ''}
    ${preview}
    ${btn(`Mover ${total} espacio(s)`, 'data-do="move"', { cls: 'wide primary' })}`;
}

// --- Negocios -----------------------------------------------------------------------------------

function businessBody(game: Game, ctx: Ctx) {
  const { ui } = ctx;
  const p = game.turn!.player;
  const here = ZONES_BY_ID[game.players[p].oyakata!];
  const shop = ZONES_BY_ID[here.shop!];
  const stalls = here.stalls!.filter((l) => game.lots[l]?.kind === 'character');
  return `
    <p class="muted">Estás en <b>${here.label}</b>. Puedes usar la tienda y un personaje de sus puestos, en cualquier orden.</p>
    <section class="biz">
      <h3>${shop.label}${game.turn!.didShop ? ' <span class="muted">· hecho</span>' : ''}</h3>
      ${game.turn!.didShop ? '' : shopBody(game, here.shop!, ctx)}
    </section>
    <section class="biz">
      <h3>Personajes de los puestos${game.turn!.didChar ? ' <span class="muted">· hecho</span>' : ''}</h3>
      ${game.turn!.didChar ? '' : stalls.length ? stalls.map((l) => characterBody(game, l, ctx)).join('') : '<p class="muted">No hay personajes en los puestos.</p>'}
    </section>
    ${btn('Terminar turno', 'data-do="endTurn"', { cls: 'wide primary' })}`;
}

const doShop = (extra: Record<string, string>) => `data-do="shop" ${Object.entries(extra).map(([k, v]) => `data-${k}="${v}"`).join(' ')}`;
const shopBtn = (game: Game, label: string, extra: Record<string, string>) => btn(label, doShop(extra), { disabled: !isLegal(game, { type: 'shop', ...extra }), cls: 'wide' });

function shopBody(game: Game, shopId: string, { ui }: Ctx) {
  const m = game.market;
  switch (shopId) {
    case 'shop-sandals': return shopBtn(game, `${chips([{ res: 'mon', n: 2 }])} → ${chips([{ res: 'sandal', n: 2 }])}`, {});
    case 'shop-rice': return shopBtn(game, `${chips([{ res: 'mon', n: 3 }])} → ${chips([{ res: 'rice', n: 2 }])}`, {});
    case 'shop-fire-tower': return shopBtn(game, '+1 Extinción de Incendios', {});
    case 'shop-pawn': return (['rice', 'sandal'] as const).map((choice) => shopBtn(game, `${chips([{ res: choice, n: 1 }])} → ${chips([{ res: 'mon', n: 4 }])}`, { choice })).join('');
    case 'shop-exchange': return [
      shopBtn(game, `${chips([{ res: 'mon', n: 6 }])} → ${chips([{ res: 'koban', n: 1 }])}`, { choice: 'koban1' }),
      shopBtn(game, `${chips([{ res: 'mon', n: 10 }])} → ${chips([{ res: 'koban', n: 2 }])}`, { choice: 'koban2' }),
      shopBtn(game, `Cobrar ${chips([{ res: 'mon', n: 2 }])}`, { choice: 'mons' }),
    ].join('');
    case 'shop-fish': return `<div class="picks">${m.fish.map((id) => {
      const t = MARKET_BY_ID[id];
      return picture(t.image!, describeToken(t), doShop({ fish: id }), { disabled: !isLegal(game, { type: 'shop', fish: id }) });
    }).join('') || '<span class="muted">No queda pescado esta estación.</span>'}</div>`;
    case 'shop-construction': return constructionBody(game, ui);
    case 'shop-tobacco': return tobaccoBody(game, ui);
    default: return '';
  }
}

function constructionBody(game: Game, ui: Ui) {
  const sel = ui.building?.via === 'shop' ? ui.building.building : null;
  return `
    ${shopBtn(game, `${chips([{ res: 'mon', n: 1 }])} → ${chips([{ res: 'rice', n: 1 }])}`, { choice: 'rice' })}
    <p class="label">Construir (+1 mon de la tienda)</p>
    <div class="picks">${game.buildings.map((b) => picture(BUILDINGS_BY_ID[b].image, `${BUILDINGS_BY_ID[b].name}: ${costText(buildCost(b, { fee: 1 }))}`,
      `data-do="building" data-via="shop" data-building="${b}"`, { selected: b === sel, disabled: !canBuildAny(game, { type: 'shop', choice: 'build', building: b }) })).join('')}</div>
    ${sel ? `<p class="muted">Cuesta ${costChips(buildCost(sel, { fee: 1 }))} (+2 mons en las esquinas). Pulsa un solar libre.</p>` : ''}`;
}

/** ¿Se puede construir en algún solar libre con esta acción base? */
const canBuildAny = (game: Game, base: ActionOf<'shop'> | ActionOf<'character'>) => freeLots(game).some((lot) => isLegal(game, { ...base, [base.type === 'shop' ? 'lot' : 'buildLot']: lot }));

function tobaccoBody(game: Game, ui: Ui) {
  const m = game.market;
  const pipe = (ui.pipe && MARKET_BY_ID[ui.pipe]) as MarketToken | null | undefined;
  const own = characterLots(game, game.turn!.player);
  const action = { type: 'shop', pipe: ui.pipe, bag: ui.bag, target: pipe?.effect!.xp ? ui.target : undefined } as Action;
  const price = [ui.pipe, ui.bag].reduce((sum, id) => sum + (id ? MARKET_BY_ID[id].cost : 0), 0);
  const mons = game.players[game.turn!.player].resources.mon;
  const tokens = (ids: string[], key: string) => ids.map((id) => picture(MARKET_BY_ID[id].image ?? '/tokens/winter/back-dark.webp', describeToken(MARKET_BY_ID[id]),
    `data-do="toggle" data-key="${key}" data-id="${id}"`, { selected: ui[key] === id, disabled: !isLegal(game, { type: 'shop', [key]: id, target: own[0] }) })).join('');
  return `
    <p class="label">Pipas</p><div class="picks">${tokens(m.pipes, 'pipe') || '<span class="muted">Ninguna</span>'}</div>
    <p class="label">Bolsas de Tabaco</p><div class="picks">${tokens(m.bags, 'bag') || '<span class="muted">Ninguna</span>'}</div>
    ${pipe?.effect!.xp ? `<p class="label">+1 experiencia a</p>${ownChoices(game, own, 'target', ui.target)}` : ''}
    ${price > mons ? `<p class="muted">Cuesta ${chips([{ res: 'mon', n: price }])} y tienes ${chips([{ res: 'mon', n: mons }])}.</p>` : ''}
    ${btn('Comprar', `data-do="shop-tobacco"`, { disabled: !(ui.pipe || ui.bag) || !isLegal(game, action), cls: 'wide primary' })}`;
}

/** Botones con tus personajes en juego (para elegir a quién va la experiencia). */
const ownChoices = (game: Game, own: string[], key: string, selected: string | null | undefined) => `<div class="zone-list">${own.map((l) =>
  btn(cardName(game.lots[l].card), `data-do="pick" data-key="${key}" data-lot="${l}"`, { cls: l === selected ? 'on' : '' })).join('') || '<span class="muted">No tienes personajes.</span>'}</div>`;

function characterBody(game: Game, lot: string, { ui }: Ctx) {
  const p = game.turn!.player;
  const entry = game.lots[lot];
  const def = CHARACTERS_BY_ID[entry.card];
  const mine = entry.owner === p;
  const own = characterLots(game, p);
  const a = def.ability;
  let options: string;
  if (a.kind === 'xp') {
    options = `<p class="label">+1 experiencia a</p><div class="zone-list">${own.map((l) =>
      btn(cardName(game.lots[l].card), `data-do="char" data-lot="${lot}" data-target="${l}"`, { disabled: !isLegal(game, { type: 'character', lot, target: l }) })).join('')}</div>`;
  } else if (a.kind === 'build') {
    const sel = ui.building?.via === 'char' && ui.building.lot === lot ? ui.building.building : null;
    options = `<div class="picks">${game.buildings.map((b) => picture(BUILDINGS_BY_ID[b].image, `${BUILDINGS_BY_ID[b].name}: ${costText(buildCost(b, { discount: a.discount }))}`,
      `data-do="building" data-via="char" data-lot="${lot}" data-building="${b}"`,
      { selected: b === sel, disabled: !canBuildAny(game, { type: 'character', lot, building: b }) })).join('')}</div>
      ${sel ? '<p class="muted">Pulsa un solar libre del tablero.</p>' : ''}`;
  } else if (a.kind === 'swap') {
    const all = Object.keys(game.lots).filter((l) => game.lots[l].kind === 'character');
    const select = (key: string) => `<select data-do="swap" data-key="${key}"><option value="">—</option>${all.map((l) =>
      `<option value="${l}"${ui[key] === l ? ' selected' : ''}>${cardName(game.lots[l].card)} (${playerName(game, game.lots[l].owner)})</option>`).join('')}</select>`;
    options = `<div class="swap">${select('swapA')} ↔ ${select('swapB')}</div>
      ${btn('Intercambiar', `data-do="char-swap" data-lot="${lot}"`, { disabled: !(ui.swapA && ui.swapB) || !isLegal(game, { type: 'character', lot, lots: [ui.swapA!, ui.swapB!] }), cls: 'wide' })}`;
  } else {
    options = btn('Activar', `data-do="char" data-lot="${lot}"`, { disabled: !isLegal(game, { type: 'character', lot }), cls: 'wide' });
  }
  return `
    <div class="char">
      <img src="${def.scan}" alt="${def.name}" data-zoom="${def.scan}" draggable="false">
      <div><b>${def.name}</b> <span class="muted">${mine ? 'tuyo' : `de ${who(game, entry.owner)}: ganará +1 experiencia`}</span>
        <p class="ability">${abilityText(def)}</p></div>
    </div>${options}`;
}

// --- Decisiones pendientes ----------------------------------------------------------------------

function pendingBody(game: Game, { ui }: Ctx) {
  const pend = game.pending!;
  if (pend.type === 'food') {
    const own = characterLots(game, pend.player);
    const drop = ui.drop ?? [];
    return `
      <p>${who(game, pend.player)} no tiene arroz para todos sus personajes (${game.players[pend.player].resources.rice} de ${own.length}).
      Elige <b>${pend.drop}</b> que se pierden; su Kobun vuelve a su tablero.</p>
      <div class="zone-list">${own.map((l) => btn(cardName(game.lots[l].card), `data-do="drop" data-lot="${l}"`, { cls: drop.includes(l) ? 'on' : '' })).join('')}</div>
      ${btn(`Confirmar (${drop.length}/${pend.drop})`, 'data-do="food"', { disabled: drop.length !== pend.drop, cls: 'wide primary' })}`;
  }
  if (pend.type === 'avoidFire') {
    return `
      <p>El fuego llega a <b>${cardName(game.lots[pend.lot].card)}</b> de ${who(game, pend.player)}. ¿Usa su ficha «Evitar un incendio»?</p>
      ${btn('Sí, evitar el incendio', 'data-do="avoid" data-use="true"', { cls: 'wide primary' })}
      ${btn('No, que arda', 'data-do="avoid" data-use="false"', { cls: 'wide' })}`;
  }
  return `
    <p>${who(game, pend.player)} tiene el Comodín de la Marionetista: ¿de qué tipo cuenta?</p>
    <div class="zone-list">${Object.entries(CHARACTER_TYPES).map(([id, t]) => btn(t.label, `data-do="wild" data-type="${id}"`)).join('')}</div>`;
}

function endedBody(game: Game) {
  return `<p>Gana ${who(game, game.final!.winner)} con ${game.final!.scores[game.final!.winner].total} IKI.</p>
    ${btn('Ver la puntuación', 'data-do="final"', { cls: 'wide primary' })}`;
}

// --- Eventos del panel --------------------------------------------------------------------------

/** Conecta los botones del panel (delegación: el HTML se redibuja entero cada vez). */
/** Elemento del panel con `data-do`: botón, casilla o desplegable. */
type Control = HTMLElement & { disabled?: boolean; type?: string; checked?: boolean; value?: string };

export function bindTurnPanel(el: HTMLElement, getCtx: () => Ctx) {
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<Control>('[data-do]');
    if (!b || b.disabled || b.tagName === 'SELECT' || b.type === 'checkbox') return;
    handle(b, getCtx());
  });
  el.addEventListener('change', (e) => {
    const b = (e.target as Element).closest<Control>('[data-do]');
    if (!b) return;
    const { set } = getCtx();
    if (b.dataset.do === 'bonus') set({ bonus: b.checked });
    if (b.dataset.do === 'swap') set({ [b.dataset.key!]: b.value || null });
  });
}

function handle(b: Control, { ui, set, dispatch, undo, game, openFinal, openLog }: Ctx) {
  const d = b.dataset as Record<string, string>;
  const num = (v: string) => Number(v);
  switch (d.do) {
    case 'undo': return undo();
    case 'cancel': return set({ hire: null });
    case 'ikizama': return dispatch({ type: 'placeIkizama', slot: d.slot as IkizamaSlot });
    case 'income': return dispatch({ type: 'income' });
    case 'place': return dispatch({ type: 'place', zone: d.zone });
    case 'base': return set({ base: num(d.n) });
    case 'sandals': return set({ sandals: Math.max(0, (ui.sandals ?? 0) + num(d.d)) });
    case 'move': return dispatch({ type: 'move', base: game!.turn!.slot === '1-4' ? ui.base ?? 1 : undefined, sandals: Math.min(ui.sandals ?? 0, game!.players[game!.turn!.player].resources.sandal), bonus: ui.bonus || undefined });
    case 'endTurn': return dispatch({ type: 'endTurn' });
    case 'shop': return dispatch({ type: 'shop', ...pick(d, ['fish', 'choice']) });
    case 'building': return set({ building: ui.building?.building === d.building && ui.building.lot === d.lot ? null : { via: d.via, lot: d.lot, building: d.building } });
    case 'toggle': return set({ [d.key]: ui[d.key] === d.id ? null : d.id });
    case 'pick': return set({ [d.key]: d.lot });
    case 'shop-tobacco': return dispatch({ type: 'shop', pipe: ui.pipe ?? undefined, bag: ui.bag ?? undefined, target: MARKET_BY_ID[ui.pipe!]?.effect!.xp ? ui.target! : undefined });
    case 'char': return dispatch({ type: 'character', lot: d.lot, ...(d.target ? { target: d.target } : {}) });
    case 'char-swap': return dispatch({ type: 'character', lot: d.lot, lots: [ui.swapA!, ui.swapB!] });
    case 'drop': {
      const drop = ui.drop ?? [];
      return set({ drop: drop.includes(d.lot) ? drop.filter((l) => l !== d.lot) : [...drop, d.lot] });
    }
    case 'food': return dispatch({ type: 'resolve', drop: ui.drop ?? [] });
    case 'avoid': return dispatch({ type: 'resolve', use: d.use === 'true' });
    case 'wild': return dispatch({ type: 'resolve', cardType: d.type as CharacterType });
    case 'final': return openFinal!();
    case 'log': return openLog!();
  }
}

const pick = (obj: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]]));
