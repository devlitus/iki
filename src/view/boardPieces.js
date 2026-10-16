import { ZONES_BY_ID, zoneCenter } from '../data/zones.js';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.js';
import { CHARACTERS_BY_ID } from '../data/characters.js';
import { BUILDINGS_BY_ID } from '../data/decks.js';
import { MARKET_BY_ID, MARKET_BACKS, seasonMarket } from '../data/market.js';
import { createCharacterCard } from '../cards/card.js';

/**
 * Dibuja sobre el tablero todo lo que hay en la partida: calendario, mercado, losetas, marcadores y peones de cada
 * jugador y las cartas de los solares. Su tamaño va en % del ancho del tablero para que escale con el zoom.
 * Lo que se puede pulsar ahora llega en `targets` ([{ zone, title, onClick }]); todo lo demás es solo para mirar.
 */
export function renderBoardPieces(board, game, { targets = [] } = {}) {
  board.pieces.replaceChildren();
  const boardId = (i) => game.players[i].boardId;
  const color = (i) => PLAYER_BOARDS_BY_ID[boardId(i)].color;

  const put = (html, zoneId, steps, { du = 0, dv = 0, title = '' } = {}) => {
    const { u, v } = zoneCenter(ZONES_BY_ID[zoneId]);
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild;
    if (steps) el.dataset.steps = steps;
    if (title) el.title = title;
    return board.place(el, u + du, v + dv);
  };
  const img = (src, cls, style = '') => `<img class="${cls}" src="${src}" style="${style}" alt="" draggable="false">`;

  put(img('/tokens/calendar.webp', 'piece piece-calendar'), `month-${game.month}`, '2', { title: `Mes ${game.month}` });

  // Mercado de la estación (paso 5): cada ficha conserva su hueco aunque se compre la de al lado.
  const market = (ids, kind, slotOf) => ids.forEach((id) => {
    const t = MARKET_BY_ID[id];
    const slot = slotOf(seasonMarket(t.season)[kind].indexOf(id));
    const html = t.image ? img(t.image, `piece piece-market piece-${kind}`) : '<div class="tok tok-bag">5</div>';
    put(html, slot, '5', { title: id });
  });
  market(game.market.fish, 'fish', (i) => `fish-${i + 1}`);
  market(game.market.pipes, 'pipe', (i) => `pipe-${i + 1}`);
  market(game.market.bags, 'bag', (i) => `pipe-${i + 3}`);
  Object.keys(game.marketFaceDown).forEach((season) =>
    put(img(MARKET_BACKS[season], 'piece piece-facedown'), `season-${season}`, '5', { title: 'Pescado, Pipas y Tabaco de la estación, boca abajo' }));

  put(`<div class="tok tok-fire-tiles"><i></i><i></i><i></i><i>${game.fireTiles.length}</i></div>`, 'fire-tiles', '4', { title: 'Losetas de Incendio' });

  // Marcadores: los que comparten casilla se reparten un poco para verse todos.
  const stackAt = (key) => (stackAt.seen[key] = (stackAt.seen[key] ?? -1) + 1);
  stackAt.seen = {};
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
  const levels = {};
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
    const def = isBuilding ? BUILDINGS_BY_ID[lot.card] : CHARACTERS_BY_ID[lot.card];
    const card = isBuilding ? Object.assign(document.createElement('article'), { className: 'card card-scan',
      innerHTML: `<img src="${def.image}" alt="${def.name}" draggable="false">` }) : createCharacterCard(def);
    card.style.width = `${zone.w * 100 * 0.92}%`;
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

  // Zonas pulsables: un botón encima de la zona, con su mismo tamaño.
  for (const { zone: id, title, onClick } of targets) {
    const zone = ZONES_BY_ID[id];
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'lot-target armed';
    target.title = title;
    target.setAttribute('aria-label', title);
    if (zone.kind === 'rect') {
      target.style.width = `${zone.w * 100}%`;
      target.style.height = `${zone.h * 100}%`;
    } else {
      target.style.width = `${zone.r * 200}%`;
      target.style.aspectRatio = '1';
      target.style.borderRadius = '50%';
    }
    target.addEventListener('pointerdown', (e) => e.stopPropagation()); // que no arrastre el tablero
    target.addEventListener('click', onClick);
    const { u, v } = zoneCenter(zone);
    board.place(target, u, v);
  }
}
