import { CHARACTERS_BY_ID, CHARACTER_TYPES } from '../data/characters.js';
import { BUILDINGS_BY_ID } from '../data/decks.js';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.js';
import { ZONES_BY_ID } from '../data/zones.js';

/** Textos de la interfaz: nombres de jugadores, recursos, habilidades y entradas del registro. */

export const playerName = (g, p) => `${PLAYER_BOARDS_BY_ID[g.players[p].boardId].name}${g.players[p].ai ? ' (IA)' : ''}`;
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
    case 'fire-start': return `Incendio de fuerza ${e.strength} en el Nagaya ${e.nagaya}`;
    case 'fire-stopped': return `El fuego se detiene en el solar de ${p}`;
    case 'fire-avoided': return `${p} evita el incendio`;
    case 'burned': return `Arde ${name(e.card)} de ${p}`;
    case 'wild': return `${p} elige el tipo ${typeLabel(e.cardType)} para el Comodín`;
    case 'end': return `Fin de la partida: gana ${who(g, e.winner)}`;
    default: return e.type;
  }
}

export { lotName, name as cardName };
