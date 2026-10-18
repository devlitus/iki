import { NAGAYAS_BY_ID, ZONES_BY_ID, fireTileImage, zoneCenter } from '../data/zones.ts';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { BUILDINGS_BY_ID } from '../data/decks.ts';
import { MARKET_BY_ID, MARKET_BACKS, describeToken, seasonMarket } from '../data/market.ts';
import { createCharacterCard } from '../cards/card.ts';
import type { Board } from '../board.ts';
import type { Building, Character, Game, LogEntry, SeasonId, Target } from '../types.ts';

type Put = (html: string, zoneId: string, steps: string | null, options?: { du?: number; dv?: number; title?: string }) => HTMLElement;
type Img = (src: string, cls: string, style?: string) => string;

/**
 * Dibuja sobre el tablero todo lo que hay en la partida: calendario, mercado, losetas, marcadores y peones de cada
 * jugador y las cartas de los solares. Su tamaño va en % del ancho del tablero para que escale con el zoom.
 * Lo que se puede pulsar ahora llega en `targets` ([{ zone, title, onClick }]); todo lo demás es solo para mirar.
 */
const FIRE_STEP_MS = 700;
const FIRE_FLIP_MS = 600;
/**
 * Recorrido de la loseta del último incendio: desde qué pestaña (−1 = sale de la pila), hasta cuál y cuándo empezó. Si
 * se redibuja el tablero a mitad, la animación sigue por donde iba en vez de empezar otra vez.
 */
let fireShown: { key: number | null | undefined; from: number; end: number; t0: number } = { key: null, from: -1, end: -1, t0: 0 };

/**
 * Solares que recorre el fuego en el incendio en curso o recién resuelto: del exterior hacia dentro, hasta el que lo
 * detiene (o el que espera la decisión de «Evitar un incendio»); si nadie lo para, hasta el último.
 */
function firePath(game: Game, nagaya: string) {
  const lots = NAGAYAS_BY_ID[nagaya].lots;
  const start = game.log.findLast((e) => e.type === 'fire-start');
  if (game.event?.kind === 'fire') return { key: start?.seq, lots: lots.slice(0, Math.min(game.event.index!, lots.length - 1) + 1) };
  const stopped = game.log.find((e) => e.seq > (start?.seq ?? 0) && e.type === 'fire-stopped') as (LogEntry & { lot: string }) | undefined;
  return { key: start?.seq, lots: lots.slice(0, stopped ? lots.indexOf(stopped.lot) + 1 : lots.length) };
}

/**
 * Loseta robada, boca arriba en las pestañas de modificador de los solares: entra por la del exterior y avanza una a una
 * (−1, −2, −3) mientras el fuego se propaga y pierde fuerza.
 */
function placeFireTile(board: Board, game: Game, nagaya: string, put: Put, img: Img) {
  const { key, lots } = firePath(game, nagaya);
  const end = lots.length - 1;
  if (fireShown.key !== key || fireShown.end !== end) {
    // Sigue desde donde se vio por última vez; si es un incendio nuevo, sale de la pila desde la pestaña exterior.
    fireShown = { key, from: fireShown.key === key ? Math.min(fireShown.end, end) : -1, end, t0: performance.now() };
  }
  // En los Nagayas de la izquierda las pestañas están impresas del revés (el fuego avanza hacia la derecha).
  const inwardRight = nagaya.endsWith('left');
  const cls = `piece piece-fire-tile${inwardRight ? ' inward-right' : ''}`;
  const placed = `translate(-50%, -50%)${inwardRight ? ' rotate(180deg)' : ''}`;
  const el = put(img(fireTileImage(nagaya), cls), `fire-tab-${lots[end]}`, null,
    { title: `Loseta de Incendio: arde el Nagaya ${NAGAYAS_BY_ID[nagaya].name}` });
  const { from, t0 } = fireShown;
  if (from === end || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const elapsed = performance.now() - t0;
  const flip = from < 0 ? FIRE_FLIP_MS : 0;
  const path = lots.slice(Math.max(from, 0)).map((lot) => zoneCenter(ZONES_BY_ID[`fire-tab-${lot}`]));
  if (elapsed >= flip + FIRE_STEP_MS * (path.length - 1)) return; // ya terminó: se queda en su sitio
  if (flip) {
    el.animate([{ transform: `${placed} perspective(400px) rotateY(90deg)` }, { transform: placed }],
      { duration: flip, easing: 'ease-out' }).currentTime = elapsed;
  }
  if (path.length > 1) {
    // Cada tramo frena en su pestaña: se ve la fuerza bajar de una en una.
    const frames = path.map(({ u, v }) => ({ left: `${u * 100}%`, top: `${v * 100}%`, easing: 'ease-in-out' }));
    el.animate(frames, { duration: FIRE_STEP_MS * (path.length - 1), delay: flip, fill: 'backwards' }).currentTime = elapsed;
  }
}

/** `fireNagaya`: Nagaya cuya loseta de Incendio está boca arriba en el tablero (el incendio en curso o recién contado). */
export function renderBoardPieces(board: Board, game: Game, { targets = [], fireNagaya = null }: { targets?: Target[]; fireNagaya?: string | null } = {}) {
  board.pieces.replaceChildren();
  const boardId = (i: number) => game.players[i].boardId;
  const color = (i: number) => PLAYER_BOARDS_BY_ID[boardId(i)].color;

  const put: Put = (html, zoneId, steps, { du = 0, dv = 0, title = '' } = {}) => {
    const { u, v } = zoneCenter(ZONES_BY_ID[zoneId]);
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    if (steps) el.dataset.steps = steps;
    if (title) el.title = title;
    return board.place(el, u + du, v + dv);
  };
  const img: Img = (src, cls, style = '') => `<img class="${cls}" src="${src}" style="${style}" alt="" draggable="false">`;

  put(img('/tokens/calendar.webp', 'piece piece-calendar'), `month-${game.month}`, '2', { title: `Mes ${game.month}` });

  // Mercado de la estación (paso 5): cada ficha conserva su hueco aunque se compre la de al lado.
  const market = (ids: string[], kind: 'fish' | 'pipe' | 'bag', slotOf: (i: number) => string) => ids.forEach((id) => {
    const t = MARKET_BY_ID[id];
    const slot = slotOf(seasonMarket(t.season)[kind].indexOf(id));
    const html = t.image ? img(t.image, `piece piece-market piece-${kind}`) : '<div class="tok tok-bag">5</div>';
    put(html, slot, '5', { title: describeToken(t) });
  });
  market(game.market.fish, 'fish', (i) => `fish-${i + 1}`);
  market(game.market.pipes, 'pipe', (i) => `pipe-${i + 1}`);
  market(game.market.bags, 'bag', (i) => `pipe-${i + 3}`);
  Object.keys(game.marketFaceDown).forEach((season) =>
    put(img(MARKET_BACKS[season as SeasonId], 'piece piece-facedown'), `season-${season}`, '5', { title: 'Pescado, Pipas y Tabaco de la estación, boca abajo' }));

  const pile = game.fireTiles.length - (fireNagaya ? 1 : 0); // la robada está en el Nagaya hasta que acaba el incendio
  put(`<div class="tok tok-fire-tiles">${'<i></i>'.repeat(pile)}<b>${pile}</b></div>`,
    'fire-tiles', '4', { title: 'Losetas de Incendio, boca abajo' });

  // Marcadores: los que comparten casilla se reparten un poco para verse todos.
  const stackAt = (key: string): number => (stackAt.seen[key] = (stackAt.seen[key] ?? -1) + 1);
  stackAt.seen = {} as Record<string, number>;
  game.turnOrder.forEach((pi) => {
    const player = game.players[pi];
    const style = `--flower:url(/tokens/score/${boardId(pi)}.webp)`;
    if (player.iki < 30) put(`<div class="tok tok-lap" style="${style}">30</div>`, 'score-lap', '3', { du: stackAt('lap') * 0.017 - 0.008, title: 'Ficha 30/60 IKI' });
    const cell = player.iki % 30;
    const k = stackAt(`score-${cell}`);
    const laps = Math.floor(player.iki / 30) * 30;
    put(`<div class="tok tok-score" style="${style}">${laps ? `+${laps}` : ''}</div>`, `score-${cell}`, '12',
      { du: [-0.012, 0.012, -0.022, 0.022][k], dv: k < 2 ? -0.012 : 0.008, title: `${player.iki} IKI` });
  });
  // Pila de Extinción: la ficha de arriba de cada casilla se dibuja más arriba y por encima.
  const levels: Record<number, number[]> = {};
  game.fireStack.forEach((pi) => (levels[game.players[pi].fire] ??= []).push(pi));
  Object.entries(levels).forEach(([level, stack]) => stack.forEach((pi, k) =>
    put(img(`/tokens/fire-marker/${boardId(pi)}.webp`, 'piece piece-fire', `z-index:${10 - k}`), `fire-${level}`, '11',
      { dv: (k - (stack.length - 1) / 2) * 0.009, title: `Extinción ${level} · ${game.fireStack.indexOf(pi) + 1}.ª de la pila` })));

  // Peones: Oyakata en la calle (o en la zona inicial) e Ikizama en el marcador de turno.
  game.players.forEach((player, pi) => {
    if (player.oyakata) {
      const k = stackAt(`oyakata-${player.oyakata}`);
      put(img(`/pawns/oyakata-${boardId(pi)}.webp`, 'piece piece-oyakata', `z-index:${5 + k}`), player.oyakata, '10', { du: k * 0.008, dv: k * -0.002, title: 'Oyakata' });
    }
    if (player.ikizama) put(img(`/pawns/ikizama-${boardId(pi)}.webp`, 'piece piece-ikizama'), `turn-${player.ikizama}`, null, { title: 'Ikizama' });
  });

  // Cartas en los solares, cada una con el Kobun de su dueño (en el espacio de experiencia que le toca).
  for (const [lotId, lot] of Object.entries(game.lots)) {
    const zone = ZONES_BY_ID[lotId];
    const isBuilding = lot.kind === 'building';
    const def = (isBuilding ? BUILDINGS_BY_ID[lot.card] : CHARACTERS_BY_ID[lot.card]) as Building & Character;
    const card = isBuilding ? Object.assign(document.createElement('article'), { className: 'card card-scan',
      innerHTML: `<img src="${def.image}" alt="${def.name}" draggable="false">` }) : createCharacterCard(def);
    card.style.width = `${zone.w! * 100 * 0.92}%`;
    card.dataset.steps = '13';
    card.dataset.zoom = isBuilding ? def.image : def.scan;
    card.title = `${def.name} · ${PLAYER_BOARDS_BY_ID[boardId(lot.owner)].name}`;
    const kobun = document.createElement('img');
    kobun.className = 'piece kobun-on-card';
    kobun.src = `/pawns/kobun-${boardId(lot.owner)}.webp`;
    kobun.alt = '';
    kobun.draggable = false;
    if (isBuilding) kobun.classList.add('on-building');
    else kobun.style.top = `${67 - lot.xp * (57 / def.salary.length)}%`; // casilla de experiencia de la columna derecha de la carta
    card.append(kobun);
    const { u, v } = zoneCenter(zone);
    board.place(card, u, v);
  }

  if (fireNagaya) placeFireTile(board, game, fireNagaya, put, img);

  // Zonas pulsables: un botón encima de la zona, con su mismo tamaño.
  for (const { zone: id, title, onClick } of targets) {
    const zone = ZONES_BY_ID[id];
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'lot-target armed';
    target.title = title;
    target.setAttribute('aria-label', title);
    if (zone.kind === 'rect') {
      target.style.width = `${zone.w! * 100}%`;
      target.style.height = `${zone.h! * 100}%`;
    } else {
      target.style.width = `${zone.r! * 200}%`;
      target.style.aspectRatio = '1';
      target.style.borderRadius = '50%';
    }
    target.addEventListener('pointerdown', (e) => e.stopPropagation()); // que no arrastre el tablero
    target.addEventListener('click', onClick);
    const { u, v } = zoneCenter(zone);
    board.place(target, u, v);
  }
}
