import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.ts';
import { BUILDINGS_BY_ID, SEASONS_BY_ID } from '../data/decks.ts';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { MARKET_BY_ID, MARKET_TOKENS } from '../data/market.ts';
import { NAGAYAS_BY_ID, ZONES_BY_ID } from '../data/zones.ts';
import { deciderOf, isAiTurn } from '../ai/player.ts';
import type { Ability, Amount, Character, Cost, Game, LogEntry, MarketToken, Res } from '../types.ts';

/** Textos de la interfaz: nombres de jugadores, recursos, habilidades y entradas del registro. */

/** Texto seguro para meter en HTML (los nombres de usuario vienen del servidor). */
export const esc = (text: unknown) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

/** «Amarillo (Ana)», «Amarillo (Hanzō · IA)»; sin nombre, «Amarillo» o «Amarillo (IA)». */
export const playerName = (g: Game, p: number) => {
  const { boardId, ai, userName } = g.players[p];
  const board = PLAYER_BOARDS_BY_ID[boardId].name;
  const name = [userName && esc(userName), ai && 'IA'].filter(Boolean).join(' · ');
  return name ? `${board} (${name})` : board;
};

/**
 * ¿Hay que esperar a otro? Juega una IA o, en una partida en línea (`g.viewer` = mi asiento), otra persona. En local no
 * hay `viewer` y quien tiene el turno lo juega cualquiera de los que están ante la pantalla.
 */
export const isWaiting = (g: Game) => isAiTurn(g) || (g.viewer != null && deciderOf(g) != null && deciderOf(g) !== g.viewer);

/** Lo que dice el panel mientras se espera: la IA «piensa», una persona «juega». */
export const waitingText = (g: Game, p: number) => (g.players[p].ai ? `${who(g, p)} está pensando…` : `Esperando a ${who(g, p)}…`);
export const playerColor = (g: Game, p: number) => PLAYER_BOARDS_BY_ID[g.players[p].boardId].color;

/** Nombre de jugador con su color, para frases y cabeceras. */
export const who = (g: Game, p: number) => `<b class="who-name" style="--player-color:${playerColor(g, p)}">${playerName(g, p)}</b>`;

const RES_LABEL: Record<string, string> = { mon: 'mons', rice: 'arroz', sandal: 'sandalias', wood: 'madera', koban: 'Koban', iki: 'IKI' };

/** n + icono del recurso (`iki` va como texto: no tiene ficha); el lector de pantalla lee el nombre del recurso. */
export const chip = (res: string, n: number) => (res === 'iki'
  ? `<span class="res" title="IKI">${n} IKI</span>`
  : `<span class="res" title="${RES_LABEL[res]}">${n}<span class="ic ic-${res}" aria-hidden="true"></span><span class="sr-only"> ${RES_LABEL[res]}</span></span>`);

/** [{ res, n }] → chips; un IKI negativo se muestra con su signo. */
export const chips = (list: Amount[]) => list.map(({ res, n }) => chip(res, n)).join(' ');

/** Coste de un edificio ({ wood: 1, mon: 2 }) en chips. */
export const costChips = (cost: Cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([res, n]) => chip(res, n)).join(' · ');

/** Coste de un edificio en texto plano (para `title` y `alt`, donde no cabe HTML). */
export const costText = (cost: Cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([res, n]) => `${n} ${RES_LABEL[res]}`).join(', ');

/** Lo que hace un personaje al activarlo, en una línea. */
export function abilityText(def: Character) {
  const a = def.ability;
  switch (a.kind) {
    case 'gain': return `+ ${chips(a.gain)}`;
    case 'trade': return `${chips(a.pay)} → ${chips(a.gain)}`;
    case 'fire': return `+1 Extinción${a.gain.length ? ` y ${chips(a.gain)}` : ''}`;
    case 'xp': return `${chips(a.pay)} → +1 experiencia a uno tuyo`;
    case 'build': return `Construye con −1 ${RES_LABEL[a.discount!.res]}`;
    case 'swap': return 'Intercambia 2 personajes del tablero';
    case 'gainOthers': return `+ ${chips(a.gain)}; los demás + ${chips(a.others!)}`;
    default: return '';
  }
}

/** Lo que hace un personaje al activarlo, como frase (para el resumen junto a la carta ampliada). */
function abilitySentence(a: Ability) {
  switch (a.kind) {
    case 'gain': return `Recibes ${chips(a.gain)}.`;
    case 'trade': return `Paga ${chips(a.pay)} y recibe ${chips(a.gain)}.`;
    case 'fire': return `Avanza 1 espacio en Extinción de Incendios${a.gain.length ? ` y recibe ${chips(a.gain)}` : ''}.`;
    case 'xp': return `Paga ${chips(a.pay)}: +1 de experiencia a uno de tus personajes.`;
    case 'build': return `Construye un Edificio pagando ${chip(a.discount!.res, a.discount!.n)} menos.`;
    case 'swap': return 'Intercambia la posición de 2 cartas de Personaje del tablero.';
    case 'gainOthers': return `Recibes ${chips(a.gain)} y cada oponente recibe ${chips(a.others!)}.`;
    default: return '';
  }
}

const RETIRE_TOKEN: Record<string, string> = { hire: 'Contratar −1', move: 'Mover +1', 'avoid-fire': 'Evitar un incendio', wild: 'Comodín' };

const BUILDING_EFFECT: Record<string, string> = {
  farm: 'Cada Día de Pago, +2 IKI por cada Kobun que alimentes.',
  'fire-tower': '+3 IKI cada vez que contratas un personaje con fuego.',
  'imperial-villa': 'Cada Día de Pago, +2 mons por cada personaje del tipo que más tengas contratado.',
  sandal: 'Al final, 3 IKI por cada sandalia (máx. 30).',
  rice: 'Al final, 4 IKI por cada arroz (máx. 32).',
  fish: 'Al final, tantos IKI como tu Pescado.',
  fire: 'Al final, 2 IKI por cada espacio de Extinción de Incendios.',
};

const BAG_SCORE: Record<string, string> = { fire2: '1 IKI por cada 2 espacios de Extinción de Incendios', mostType: '1 IKI por cada personaje del tipo que más tengas',
  types: '1 IKI por cada tipo de personaje distinto', mon4: '1 IKI por cada 4 mons' };

/** Resumen de una ficha de Pescado, Pipa o Tabaco, como el de las cartas. */
function tokenSummary(t: MarketToken) {
  const head = `<h3>${TOKEN_NAME[t.kind].replace(/^una? /, '')}</h3>
    <p class="meta">${SEASONS_BY_ID[t.season].name} · cuesta ${chip('mon', t.cost)}</p>`;
  if (t.kind === 'fish') {
    return `${head}<p><b>Al final:</b> los Pescados de estaciones distintas puntúan juntos (3, 6, 10 o 15 IKI)${t.bonus ? `, y este da <b>${t.bonus} IKI</b> más` : ''}.</p>
      <p>Solo uno por estación.</p>`;
  }
  if (t.kind === 'pipe') {
    const e = t.effect!;
    const what = e.fire ? `+${e.fire} en Extinción de Incendios` : e.xp ? '+1 de experiencia a uno de tus personajes' : `recibes ${chips(e.gain!)}`;
    return `${head}<p><b>Al comprarla:</b> ${what}.</p><p><b>Al final:</b> con una Pipa, tu Tabaco puntúa el doble.</p>`;
  }
  return `${head}<p><b>Al final:</b> ${t.score!.iki != null ? `${t.score!.iki} IKI` : BAG_SCORE[t.score!.per!]}; el doble si tienes una Pipa.</p>`;
}

const SUMMARY_BY_IMAGE = new Map<string, () => string>([
  ...MARKET_TOKENS.filter((t) => t.image).map((t) => [t.image!, () => tokenSummary(t)] as [string, () => string]),
  ...Object.values(CHARACTERS_BY_ID).map((c) => [c.scan, () => `
    <h3>${c.name}</h3>
    <p class="meta">${typeLabel(c.type)} · ${c.cost == null ? 'Personaje inicial' : `cuesta ${chip('mon', c.cost)}`}</p>
    <p><b>Al activarlo:</b> ${abilitySentence(c.ability)}</p>
    ${c.fire ? `<p><b>Al contratarlo:</b> +${c.fire} en Extinción de Incendios.</p>` : ''}
    ${c.retireToken ? `<p><b>Al retirarse:</b> ficha ${RETIRE_TOKEN[c.retireToken]}.</p>` : ''}`] as [string, () => string]),
  ...Object.values(BUILDINGS_BY_ID).map((b) => [b.image, () => `
    <h3>${b.name}</h3>
    <p class="meta">Edificio · cuesta ${costChips(b.cost)}</p>
    ${b.iki ? `<p><b>Al final:</b> ${b.iki} IKI.</p>` : ''}
    ${b.perk || b.score ? `<p>${BUILDING_EFFECT[(b.perk ?? b.score)!]}</p>` : ''}`] as [string, () => string]),
]);

/** Resumen de la carta cuya imagen es `src` (personaje o edificio), o '' si no es una carta. */
export const cardSummary = (src: string) => SUMMARY_BY_IMAGE.get(src)?.() ?? '';

export const shopName = (zoneId: string) => ZONES_BY_ID[ZONES_BY_ID[zoneId].shop!].label;
/** «el Mercado de Pescado», «la Tienda de Arroz»: la casilla de la calle por su tienda (su nombre interno no dice nada). */
export const theShop = (zoneId: string) => `${/^(Mercado|Lugar)/.test(shopName(zoneId)) ? 'el' : 'la'} ${shopName(zoneId)}`;
/** «al Mercado de Pescado», «a la Tienda de Arroz». */
export const toShop = (zoneId: string) => `a ${theShop(zoneId)}`.replace(/^a el /, 'al ');
export const typeLabel = (type: string) => CHARACTER_TYPES[type as keyof typeof CHARACTER_TYPES]?.label ?? type;

const name = (id: string): string => CHARACTERS_BY_ID[id]?.name ?? BUILDINGS_BY_ID[id]?.name ?? id;
const lotName = (g: Game, lot: string) => name(g.lots[lot]?.card);
/** Nombre del Nagaya de un solar (`lot-top-left-3` → «amarillo»). */
const nagayaOfLot = (lot: string) => NAGAYAS_BY_ID[lot.replace(/^lot-|-\d$/g, '')]?.name ?? lot;

/** Entradas del registro que cuentan lo que pasó en el Evento del mes (para el resumen). */
export const EVENT_LOG_TYPES = ['salary', 'harmony', 'perk', 'starve', 'food', 'fire-start', 'fire-stopped', 'fire-avoided', 'burned'];

const TOKEN_NAME: Record<string, string> = { fish: 'un Pescado', pipe: 'una Pipa', bag: 'una Bolsa de Tabaco' };

/** Lo que hizo un jugador en una tienda, con lo que pagó y lo que se llevó (sin el sujeto). */
function shopDeal(e: Entry) {
  const at = ZONES_BY_ID[e.shop].label;
  const token = (id: string) => `${TOKEN_NAME[MARKET_BY_ID[id].kind]} de ${chip('mon', MARKET_BY_ID[id].cost)}`;
  switch (e.shop) {
    case 'shop-sandals': return `compra ${chip('sandal', 2)} por ${chip('mon', 2)}`;
    case 'shop-rice': return `compra ${chip('rice', 2)} por ${chip('mon', 3)}`;
    case 'shop-pawn': return e.choice ? `empeña ${chip(e.choice, 1)} por ${chip('mon', 4)}` : `usa ${at}`;
    case 'shop-exchange': return e.choice === 'mons' ? `cobra ${chip('mon', 2)} en ${at}`
      : e.choice ? `cambia ${chip('mon', e.choice === 'koban1' ? 6 : 10)} por ${chip('koban', e.choice === 'koban1' ? 1 : 2)}` : `usa ${at}`;
    case 'shop-construction': return e.choice === 'rice' ? `compra ${chip('rice', 1)} por ${chip('mon', 1)} en ${at}` : `usa ${at}`;
    case 'shop-fish': return e.fish ? `compra ${token(e.fish)}` : `usa ${at}`;
    case 'shop-tobacco': {
      const bought = [e.pipe, e.bag].filter(Boolean).map(token);
      return bought.length ? `compra ${bought.join(' y ')}` : `usa ${at}`;
    }
    default: return `usa ${at}`;
  }
}

/** Una entrada del registro como frase (HTML); `g` da los nombres de los jugadores. */
/** Campos de una entrada del registro: dependen de `type` (ver los `log(g, …)` del motor). */
type Entry = { [field: string]: any } & Pick<LogEntry, 'seq' | 'month' | 'type'>;


export function logLine(g: Game, e: Entry) {

  const p = e.player != null ? who(g, e.player) : '';
  switch (e.type) {
    case 'month': return `<b>${monthLabel(e.month)}</b>`;
    case 'income': return `${p} cobra ingresos (+4 mons)`;
    case 'hire': return `${p} contrata a ${name(e.card)}`;
    case 'move': return `${p} se mueve ${toShop(e.to)}${e.laps ? ` y da la vuelta (+${e.laps} exp.)` : ''}`;
    case 'place': return `${p} coloca su Oyakata en ${theShop(e.to)}`;
    case 'shop': return `${p} ${shopDeal(e)}`;
    case 'character': return `${p} activa a ${name(e.card)}${e.owner !== e.player ? ` de ${who(g, e.owner)}` : ''}${e.swapped ? ` e intercambia ${
      (e.swapped as { card: string; from: string }[]).map((s) => `${name(s.card)} (Nagaya ${nagayaOfLot(s.from)})`).join(' y ')}` : ''}`;
    case 'build': return `${p} construye ${name(e.card)}`;
    case 'fire': return `${p} sube a ${e.level} en Extinción`;
    case 'retire': return `${p} retira a ${name(e.card)}`;
    case 'salary': return `${p} cobra ${Object.entries(e.gain as Cost).filter(([, n]) => n).map(([r, n]) => chip(r, n)).join(' ') || 'nada'} de salario`;
    case 'perk': return `${p} gana ${Object.entries(e.gain as Cost).map(([r, n]) => chip(r, n)).join(' ')} por ${name(e.building)}`;
    case 'harmony': return `${p} gana ${e.iki} IKI por Armonía`;
    case 'food': return `${p} alimenta a ${e.fed} personaje(s)${e.dropped ? ` y pierde ${e.dropped}` : ''}`;
    case 'starve': return `${p} pierde a ${name(e.card)} por falta de arroz`;
    case 'fire-start': return `Incendio de fuerza ${e.strength} en el Nagaya ${NAGAYAS_BY_ID[e.nagaya].name}`;
    case 'fire-stopped': return e.card
      ? `El fuego se detiene en ${name(e.card)} de ${p}: Extinción ${e.level} contra fuerza ${e.strength}`
      : `El fuego se detiene en el solar de ${p}`;
    case 'fire-avoided': return `${p} evita que arda ${e.card ? name(e.card) : 'su personaje'} («Evitar un incendio»)`;
    case 'burned': return `Arde ${name(e.card)} de ${p}`;
    case 'wild': return `${p} elige el tipo ${typeLabel(e.cardType)} para el Comodín`;
    case 'end': return `Fin de la partida: gana ${who(g, e.winner)}`;
    default: return e.type;
  }
}

/** Cabecera de un mes en el registro («Mes 3», y el 13 es el Día de Año Nuevo). */
export const monthLabel = (month: number) => (month === 13 ? 'Día de Año Nuevo' : `Mes ${month}`);

/**
 * Entradas del registro agrupadas por mes, del más reciente al más antiguo y, dentro de cada mes, lo último arriba;
 * `heading` es la etiqueta de la cabecera de cada grupo (h3, h4…).
 */
export function logByMonth(g: Game, entries: LogEntry[], heading = 'h4') {
  const months = new Map<number, LogEntry[]>();
  for (const e of entries) if (e.type !== 'month') months.set(e.month, [...(months.get(e.month) ?? []), e]);
  return [...months].reverse().map(([month, list]) => `<section class="log-month">
    <${heading}>${monthLabel(month)}</${heading}>
    <ul>${list.reverse().map((e) => `<li>${logLine(g, e)}</li>`).join('')}</ul></section>`).join('');
}

export { lotName, name as cardName };
