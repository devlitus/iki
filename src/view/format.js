import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.ts';
import { BUILDINGS_BY_ID } from '../data/decks.ts';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { NAGAYAS_BY_ID, ZONES_BY_ID } from '../data/zones.ts';
import { deciderOf, isAiTurn } from '../ai/player.ts';

/** Textos de la interfaz: nombres de jugadores, recursos, habilidades y entradas del registro. */

/** Texto seguro para meter en HTML (los nombres de usuario vienen del servidor). */
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** «Amarillo (Ana)», «Amarillo (Hanzō · IA)»; sin nombre, «Amarillo» o «Amarillo (IA)». */
export const playerName = (g, p) => {
  const { boardId, ai, userName } = g.players[p];
  const board = PLAYER_BOARDS_BY_ID[boardId].name;
  const name = [userName && esc(userName), ai && 'IA'].filter(Boolean).join(' · ');
  return name ? `${board} (${name})` : board;
};

/**
 * ¿Hay que esperar a otro? Juega una IA o, en una partida en línea (`g.viewer` = mi asiento), otra persona. En local no
 * hay `viewer` y quien tiene el turno lo juega cualquiera de los que están ante la pantalla.
 */
export const isWaiting = (g) => isAiTurn(g) || (g.viewer != null && deciderOf(g) != null && deciderOf(g) !== g.viewer);

/** Lo que dice el panel mientras se espera: la IA «piensa», una persona «juega». */
export const waitingText = (g, p) => (g.players[p].ai ? `${who(g, p)} está pensando…` : `Esperando a ${who(g, p)}…`);
export const playerColor = (g, p) => PLAYER_BOARDS_BY_ID[g.players[p].boardId].color;

/** Nombre de jugador con su color, para frases y cabeceras. */
export const who = (g, p) => `<b class="who-name" style="--player-color:${playerColor(g, p)}">${playerName(g, p)}</b>`;

const RES_LABEL = { mon: 'mons', rice: 'arroz', sandal: 'sandalias', wood: 'madera', koban: 'Koban', iki: 'IKI' };

/** n + icono del recurso (`iki` va como texto: no tiene ficha). */
export const chip = (res, n) => (res === 'iki'
  ? `<span class="res" title="IKI">${n} IKI</span>`
  : `<span class="res" title="${RES_LABEL[res]}">${n}<span class="ic ic-${res}"></span></span>`);

/** [{ res, n }] → chips; un IKI negativo se muestra con su signo. */
export const chips = (list) => list.map(({ res, n }) => chip(res, n)).join(' ');

/** Coste de un edificio ({ wood: 1, mon: 2 }) en chips. */
export const costChips = (cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([res, n]) => chip(res, n)).join(' · ');

/** Coste de un edificio en texto plano (para `title` y `alt`, donde no cabe HTML). */
export const costText = (cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([res, n]) => `${n} ${RES_LABEL[res]}`).join(', ');

/** Lo que hace un personaje al activarlo, en una línea. */
export function abilityText(def) {
  const a = def.ability;
  switch (a.kind) {
    case 'gain': return `+ ${chips(a.gain)}`;
    case 'trade': return `${chips(a.pay)} → ${chips(a.gain)}`;
    case 'fire': return `+1 Extinción${a.gain.length ? ` y ${chips(a.gain)}` : ''}`;
    case 'xp': return `${chips(a.pay)} → +1 experiencia a uno tuyo`;
    case 'build': return `Construye con −1 ${RES_LABEL[a.discount.res]}`;
    case 'swap': return 'Intercambia 2 personajes del tablero';
    case 'gainOthers': return `+ ${chips(a.gain)}; los demás + ${chips(a.others)}`;
    default: return '';
  }
}

/** Lo que hace un personaje al activarlo, como frase (para el resumen junto a la carta ampliada). */
function abilitySentence(a) {
  switch (a.kind) {
    case 'gain': return `Recibes ${chips(a.gain)}.`;
    case 'trade': return `Paga ${chips(a.pay)} y recibe ${chips(a.gain)}.`;
    case 'fire': return `Avanza 1 espacio en Extinción de Incendios${a.gain.length ? ` y recibe ${chips(a.gain)}` : ''}.`;
    case 'xp': return `Paga ${chips(a.pay)}: +1 de experiencia a uno de tus personajes.`;
    case 'build': return `Construye un Edificio pagando ${chip(a.discount.res, a.discount.n)} menos.`;
    case 'swap': return 'Intercambia la posición de 2 cartas de Personaje del tablero.';
    case 'gainOthers': return `Recibes ${chips(a.gain)} y cada oponente recibe ${chips(a.others)}.`;
    default: return '';
  }
}

const RETIRE_TOKEN = { hire: 'Contratar −1', move: 'Mover +1', 'avoid-fire': 'Evitar un incendio', wild: 'Comodín' };

const BUILDING_EFFECT = {
  farm: 'Cada Día de Pago, +2 IKI por cada Kobun que alimentes.',
  'fire-tower': '+3 IKI cada vez que contratas un personaje con fuego.',
  'imperial-villa': 'Cada Día de Pago, +2 mons por cada personaje del tipo que más tengas contratado.',
  sandal: 'Al final, 3 IKI por cada sandalia (máx. 30).',
  rice: 'Al final, 4 IKI por cada arroz (máx. 32).',
  fish: 'Al final, tantos IKI como tu Pescado.',
  fire: 'Al final, 2 IKI por cada espacio de Extinción de Incendios.',
};

const SUMMARY_BY_IMAGE = new Map([
  ...Object.values(CHARACTERS_BY_ID).map((c) => [c.scan, () => `
    <h3>${c.name}</h3>
    <p class="meta">${typeLabel(c.type)} · ${c.cost == null ? 'Personaje inicial' : `cuesta ${chip('mon', c.cost)}`}</p>
    <p><b>Al activarlo:</b> ${abilitySentence(c.ability)}</p>
    ${c.fire ? `<p><b>Al contratarlo:</b> +${c.fire} en Extinción de Incendios.</p>` : ''}
    ${c.retireToken ? `<p><b>Al retirarse:</b> ficha ${RETIRE_TOKEN[c.retireToken]}.</p>` : ''}`]),
  ...Object.values(BUILDINGS_BY_ID).map((b) => [b.image, () => `
    <h3>${b.name}</h3>
    <p class="meta">Edificio · cuesta ${costChips(b.cost)}</p>
    ${b.iki ? `<p><b>Al final:</b> ${b.iki} IKI.</p>` : ''}
    ${b.perk || b.score ? `<p>${BUILDING_EFFECT[b.perk ?? b.score]}</p>` : ''}`]),
]);

/** Resumen de la carta cuya imagen es `src` (personaje o edificio), o '' si no es una carta. */
export const cardSummary = (src) => SUMMARY_BY_IMAGE.get(src)?.() ?? '';

export const shopName = (zoneId) => ZONES_BY_ID[ZONES_BY_ID[zoneId].shop].label;
export const typeLabel = (type) => CHARACTER_TYPES[type]?.label ?? type;

const name = (id) => CHARACTERS_BY_ID[id]?.name ?? BUILDINGS_BY_ID[id]?.name ?? id;
const lotName = (g, lot) => name(g.lots[lot]?.card);

/** Entradas del registro que cuentan lo que pasó en el Evento del mes (para el resumen). */
export const EVENT_LOG_TYPES = ['salary', 'harmony', 'starve', 'food', 'fire-start', 'fire-stopped', 'fire-avoided', 'burned'];

/** Una entrada del registro como frase (HTML); `g` da los nombres de los jugadores. */
export function logLine(g, e) {
  const p = e.player != null ? who(g, e.player) : '';
  switch (e.type) {
    case 'month': return `<b>Mes ${e.month}</b>`;
    case 'income': return `${p} cobra ingresos (+4 mons)`;
    case 'hire': return `${p} contrata a ${name(e.card)}`;
    case 'move': return `${p} se mueve a ${ZONES_BY_ID[e.to].label}${e.laps ? ` y da la vuelta (+${e.laps} exp.)` : ''}`;
    case 'place': return `${p} coloca su Oyakata en ${ZONES_BY_ID[e.to].label}`;
    case 'shop': return `${p} usa ${ZONES_BY_ID[e.shop].label}`;
    case 'character': return `${p} activa a ${name(e.card)}${e.owner !== e.player ? ` de ${who(g, e.owner)}` : ''}`;
    case 'build': return `${p} construye ${name(e.card)}`;
    case 'fire': return `${p} sube a ${e.level} en Extinción`;
    case 'retire': return `${p} retira a ${name(e.card)}`;
    case 'salary': return `${p} cobra ${Object.entries(e.gain).filter(([, n]) => n).map(([r, n]) => chip(r, n)).join(' ') || 'nada'} de salario`;
    case 'harmony': return `${p} gana ${e.iki} IKI por Armonía`;
    case 'food': return `${p} alimenta a ${e.fed} personaje(s)${e.dropped ? ` y pierde ${e.dropped}` : ''}`;
    case 'starve': return `${p} pierde a ${name(e.card)} por falta de arroz`;
    case 'fire-start': return `Incendio de fuerza ${e.strength} en el Nagaya ${NAGAYAS_BY_ID[e.nagaya].name}`;
    case 'fire-stopped': return `El fuego se detiene en el solar de ${p}`;
    case 'fire-avoided': return `${p} evita el incendio`;
    case 'burned': return `Arde ${name(e.card)} de ${p}`;
    case 'wild': return `${p} elige el tipo ${typeLabel(e.cardType)} para el Comodín`;
    case 'end': return `Fin de la partida: gana ${who(g, e.winner)}`;
    default: return e.type;
  }
}

export { lotName, name as cardName };
