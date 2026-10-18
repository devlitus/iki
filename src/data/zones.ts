/**
 * Zonas del tablero de IKI en coordenadas normalizadas (0..1, origen arriba-izquierda).
 * - rect:   x, y = esquina superior izquierda; w, h = tamaño.
 * - circle: cx, cy = centro; r = radio en fracción del ANCHO del tablero.
 * Coordenadas obtenidas analizando public/textures/tablero-iki.jpg (2048×1870).
 */

import type { Nagaya, Zone } from '../types.ts';

const BOARD_ASPECT = 2048 / 1870;

const rect = (id: string, group: string, label: string, x: number, y: number, w: number, h: number, extra: Partial<Zone> = {}): Zone =>
  ({ id, group, label, kind: 'rect', x, y, w, h, ...extra });
const circle = (id: string, group: string, label: string, cx: number, cy: number, r: number, extra: Partial<Zone> = {}): Zone =>
  ({ id, group, label, kind: 'circle', cx, cy, r, ...extra });

// --- Calendario: 13 cartas de mes en 4 grupos + 3 círculos de estación -----------------------
const CARD_W = 0.0537;
const CARD_Y = 0.0139;
const CARD_H = 0.1139;
const MONTH_GROUP_X = [0.0161, 0.2461, 0.4751, 0.7036]; // primera carta de cada grupo de 3

const calendar: Zone[] = [];
MONTH_GROUP_X.forEach((x0, g) => {
  for (let i = 0; i < 3; i++) {
    const month = g * 3 + i + 1;
    calendar.push(rect(`month-${month}`, 'calendar', `Mes ${month}`, x0 + i * CARD_W, CARD_Y, CARD_W, CARD_H, { month }));
  }
});
calendar.push(rect('month-13', 'calendar', 'Mes 13 (Año nuevo)', 0.9297, CARD_Y, CARD_W, CARD_H, { month: 13 }));
([['summer', 'Verano', 0.2173], ['autumn', 'Otoño', 0.4462], ['winter', 'Invierno', 0.6749]] satisfies [string, string, number][]).forEach(([id, label, cx]) => {
  calendar.push(circle(`season-${id}`, 'calendar', label, cx, 0.0575, 0.025));
});

// --- Solares: 16 huecos para edificios, en 4 manzanas de 4 ------------------------------------
// Modificador de fuerza del incendio impreso en cada solar. 0 = solar exterior con estampado: origen del
// incendio en ese Nagaya (ver docs/reglas.md, p. 9).
const LOT_COLUMNS = [
  [0.0107, 0.1162], [0.1230, 0.2290], [0.2363, 0.3423], [0.3491, 0.4551],
  [0.5459, 0.6514], [0.6587, 0.7646], [0.7715, 0.8774], [0.8843, 0.9902],
];
const LOT_ROWS: Record<string, number[]> = { top: [0.1626, 0.3390], bottom: [0.6610, 0.8412] };
const LOT_FIRE: Record<string, number[]> = { top: [0, -1, -2, -3, -3, -2, -1, 0], bottom: [0, -1, -2, -3, -3, -2, -1, 0] };
// Solares junto al cruce central: cuestan 2 mons extra y forman el 5.º grupo de la Armonía (p. 5 y 8).
const CORNER_COLUMNS = [3, 4];

const lots: Zone[] = [];
for (const [row, [y0, y1]] of Object.entries(LOT_ROWS)) {
  LOT_COLUMNS.forEach(([x0, x1], i) => {
    const side = i < 4 ? 'left' : 'right';
    const n = (i % 4) + 1;
    lots.push(rect(`lot-${row}-${side}-${n}`, 'lots', `Solar ${row === 'top' ? 'superior' : 'inferior'} ${side === 'left' ? 'izq.' : 'der.'} ${n}`,
      x0, y0, x1 - x0, y1 - y0, { fire: LOT_FIRE[row][i], corner: CORNER_COLUMNS.includes(i), extraCost: CORNER_COLUMNS.includes(i) ? 2 : 0 }));
  });
}

// Pestaña impresa junto a cada solar con su modificador de incendio (el «<» con el estampado en el exterior): por ellas
// avanza la loseta de Incendio. Arriba quedan encima del solar y abajo debajo. Píxeles [x0, x1] de la textura.
const FIRE_TAB_X = [[78, 180], [331, 391], [562, 622], [792, 854], [1199, 1259], [1428, 1488], [1660, 1720], [1870, 1970]];
const FIRE_TAB_Y: Record<string, number[]> = { top: [273, 306], bottom: [1570, 1602] };
const fireTabs: Zone[] = [];
for (const [row, [y0, y1]] of Object.entries(FIRE_TAB_Y)) {
  FIRE_TAB_X.forEach(([x0, x1], i) => {
    const lot = lots.find((z) => z.id.startsWith(`lot-${row}-`) && z.x === LOT_COLUMNS[i][0]);
    fireTabs.push(rect(`fire-tab-${lot.id}`, 'fire', `Incendio ${lot.fire || '<'} · ${lot.label}`, x0 / 2048, y0 / 1870, (x1 - x0) / 2048, (y1 - y0) / 1870, { lot: lot.id }));
  });
}

// --- Calle: 8 casillas en circuito + cola de entrada ------------------------------------------
// Flechas del tablero: fila superior hacia la izquierda, inferior hacia la derecha.
const STREET_COLS = [[0.0240, 0.2256], [0.2495, 0.4512], [0.5490, 0.7500], [0.7744, 0.9761]];
const STREET_ROWS: Record<string, number[]> = { top: [0.4572, 0.4979], bottom: [0.5043, 0.5449] };
const STREET_ORDER = ['street-t4', 'street-t3', 'street-t2', 'street-t1', 'street-b1', 'street-b2', 'street-b3', 'street-b4'];

// Tienda de cada casilla (el pergamino de su lado de la calle) y sus 2 puestos: los solares de detrás del pergamino.
const STREET_SHOPS: Record<string, string[]> = {
  top: ['shop-rice', 'shop-sandals', 'shop-exchange', 'shop-fish'],
  bottom: ['shop-fire-tower', 'shop-tobacco', 'shop-pawn', 'shop-construction'],
};
const stallsOf = (row: string, i: number) => {
  const side = i < 2 ? 'left' : 'right';
  const first = (i % 2) * 2 + 1;
  return [`lot-${row}-${side}-${first}`, `lot-${row}-${side}-${first + 1}`];
};

const street: Zone[] = [];
for (const [row, [y0, y1]] of Object.entries(STREET_ROWS)) {
  STREET_COLS.forEach(([x0, x1], i) => {
    const id = `street-${row[0]}${i + 1}`;
    const next = STREET_ORDER[(STREET_ORDER.indexOf(id) + 1) % STREET_ORDER.length];
    street.push(rect(id, 'street', `Calle ${row === 'top' ? 'arriba' : 'abajo'} ${i + 1}`, x0, y0, x1 - x0, y1 - y0,
      { next, shop: STREET_SHOPS[row][i], stalls: stallsOf(row, i) }));
  });
}
street.push(rect('street-lap', 'street', 'Casilla de vuelta (+1 experiencia a todos tus personajes)', 0.4605, 0.4410, 0.0365, 0.0270));

const queue = [[0.2305, 0.2636], [0.2770, 0.3102], [0.3230, 0.3561], [0.3695, 0.4027]]
  .map(([y0, y1], i) => rect(`queue-${i + 1}`, 'queue', `Zona inicial ${i + 1}`, 0.4845, y0, 0.0380, y1 - y0));

// --- Tiendas (pergaminos con el intercambio impreso) y sus huecos -----------------------------
const shops = [
  rect('shop-rice', 'shops', 'Tienda de Arroz', 0.0575, 0.357, 0.1225, 0.034),
  rect('shop-sandals', 'shops', 'Tienda de Sandalias', 0.2850, 0.357, 0.1210, 0.034),
  rect('shop-exchange', 'shops', 'Tienda de Cambio', 0.5825, 0.357, 0.1475, 0.034),
  rect('shop-fish', 'shops', 'Mercado de Pescado', 0.8200, 0.347, 0.1225, 0.033),
  rect('shop-fire-tower', 'shops', 'Torre de Incendios', 0.0575, 0.610, 0.1225, 0.033),
  rect('shop-tobacco', 'shops', 'Tienda de Tabaco', 0.2825, 0.623, 0.1225, 0.031),
  rect('shop-pawn', 'shops', 'Casa de Empeños', 0.5825, 0.610, 0.1425, 0.033),
  rect('shop-construction', 'shops', 'Lugar de Construcción', 0.8075, 0.610, 0.1475, 0.033),
];
const fishSlots = [0.849, 0.910].map((cx, i) => circle(`fish-${i + 1}`, 'shops', `Pescado ${i + 1}`, cx, 0.4236, 0.022));
const pipeSlots = [0.2605, 0.3205, 0.3805, 0.4385].map((cx, i) => circle(`pipe-${i + 1}`, 'shops', `Pipa / Tabaco ${i + 1}`, cx, 0.5754, 0.022));

// --- Marcadores inferiores --------------------------------------------------------------------
// De izquierda a derecha: 10, 9, … 0. Los círculos 10, 8 y 5 son más grandes en el tablero.
const FIRE_X = [0.0563, 0.0878, 0.1230, 0.1581, 0.1907, 0.2264, 0.2610, 0.2936, 0.3261, 0.3576, 0.3891];
const fireTrack = FIRE_X.map((cx, i) => {
  const value = 10 - i;
  const r = [10, 8, 5].includes(value) ? 0.0168 : 0.0137;
  return circle(`fire-${value}`, 'fire', `Fuego ${value}`, cx, 0.895, r, { value });
});
fireTrack.push(circle('fire-event', 'fire', 'Incendio', 0.4248, 0.895, 0.0168));
fireTrack.push(rect('fire-tiles', 'fire', 'Pila de losetas de Incendio', 0.4625, 0.8780, 0.0555, 0.0370));

const turnOrder = ([['4', 0.651], ['3', 0.712], ['2', 0.774], ['1', 0.836], ['1-4', 0.898]] satisfies [string, number][])
  .map(([label, cx]) => circle(`turn-${label}`, 'turn', `Turno ${label}`, cx, 0.8955, 0.02));

// Puntos: 0 a 29 de derecha a izquierda, siguiendo la línea ondulada de flores.
const SCORE: [number, number][] = [
  [0.9521, 0.9524], [0.9228, 0.9596], [0.8928, 0.9521], [0.8634, 0.9595], [0.8336, 0.9521],
  [0.8042, 0.9659], [0.7743, 0.9524], [0.7447, 0.9594], [0.7151, 0.9525], [0.6854, 0.9596],
  [0.6560, 0.9459], [0.6263, 0.9594], [0.5968, 0.9526], [0.5674, 0.9598], [0.5374, 0.9525],
  [0.5082, 0.9661], [0.4784, 0.9527], [0.4493, 0.9595], [0.4192, 0.9525], [0.3898, 0.9595],
  [0.3601, 0.9462], [0.3301, 0.9599], [0.3009, 0.9526], [0.2713, 0.9598], [0.2414, 0.9523],
  [0.2118, 0.9665], [0.1819, 0.9529], [0.1523, 0.9596], [0.1232, 0.9527], [0.0936, 0.9598],
];
const score = SCORE.map(([cx, cy], n) => circle(`score-${n}`, 'score', `Puntos ${n}`, cx, cy, 0.0125, { value: n }));
score.push(circle('score-lap', 'score', 'Vuelta (+30)', 0.0704, 0.9359, 0.008));

export const ZONES: Zone[] = [...calendar, ...lots, ...street, ...queue, ...shops, ...fishSlots, ...pipeSlots, ...fireTrack, ...fireTabs, ...turnOrder, ...score];

export const ZONES_BY_ID: Record<string, Zone> = Object.assign(Object.create(null), Object.fromEntries(ZONES.map((z) => [z.id, z]))); // sin prototipo: «constructor» o «__proto__» no son ids

/** Centro de una zona en coordenadas normalizadas, para colocar piezas con board.place(). */
export function zoneCenter(zone: Zone): { u: number; v: number } {
  return zone.kind === 'rect' ? { u: zone.x! + zone.w! / 2, v: zone.y! + zone.h! / 2 } : { u: zone.cx!, v: zone.cy! };
}

/** Radio vertical de un círculo en fracción del ALTO (el radio r va en fracción del ancho). */
export const radiusV = (zone: Zone) => zone.r! * BOARD_ASPECT;

// --- Reglas ligadas a las zonas ---------------------------------------------------------------

/** Casillas de la calle en el sentido de las flechas. */
export const STREET = STREET_ORDER;
/** Al pasar de esta casilla a la siguiente se cruza la casilla de vuelta (+1 experiencia a todos tus personajes). */
export const LAP_FROM = 'street-t3';
/** Primera casilla al salir de la zona inicial: se entra por la casilla de vuelta sin completar vuelta. */
export const STREET_ENTRY = 'street-t2';

/**
 * Nagayas: 4 manzanas de 4 solares, ordenados desde el solar exterior (origen del incendio, con el estampado de su
 * loseta de Incendio) hacia el cruce central.
 */
export const NAGAYAS: Nagaya[] = [
  { id: 'top-left', pattern: 'yellow', name: 'amarillo', lots: ['lot-top-left-1', 'lot-top-left-2', 'lot-top-left-3', 'lot-top-left-4'] },
  { id: 'top-right', pattern: 'blue', name: 'azul', lots: ['lot-top-right-4', 'lot-top-right-3', 'lot-top-right-2', 'lot-top-right-1'] },
  { id: 'bottom-left', pattern: 'red', name: 'rojo', lots: ['lot-bottom-left-1', 'lot-bottom-left-2', 'lot-bottom-left-3', 'lot-bottom-left-4'] },
  { id: 'bottom-right', pattern: 'purple', name: 'morado', lots: ['lot-bottom-right-4', 'lot-bottom-right-3', 'lot-bottom-right-2', 'lot-bottom-right-1'] },
];

/** Loseta de Incendio de un Nagaya: lleva su estampado. */
export const fireTileImage = (nagayaId: string) => `/tokens/fire-tile/${NAGAYAS_BY_ID[nagayaId].pattern}.webp`;
export const NAGAYAS_BY_ID: Record<string, Nagaya> = Object.assign(Object.create(null), Object.fromEntries(NAGAYAS.map((n) => [n.id, n]))); // sin prototipo: «constructor» o «__proto__» no son ids

/** Grupos de la Bonificación por Armonía: los 4 Nagayas y el 5.º grupo de las esquinas. */
export const HARMONY_GROUPS: string[][] = [
  ...NAGAYAS.map((n) => n.lots),
  ZONES.filter((z) => z.group === 'lots' && z.corner).map((z) => z.id),
];

export const LOT_IDS = ZONES.filter((z) => z.group === 'lots').map((z) => z.id);
