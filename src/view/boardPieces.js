import { ZONES_BY_ID, zoneCenter } from '../data/zones.js';
import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.js';
import { CHARACTERS_BY_ID } from '../data/characters.js';
import { createCharacterCard } from '../cards/card.js';
import { freeOuterLots } from '../game/setup.js';

/**
 * Dibuja sobre el tablero las piezas de la preparación (pasos 2-5 y 10-13). Las fichas son formas de
 * color provisionales; su tamaño va en % del ancho del tablero para que escalen con el zoom.
 */
export function renderBoardPieces(board, game, { selectedCard, onPlace }) {
  board.pieces.replaceChildren();
  const color = (i) => PLAYER_BOARDS_BY_ID[game.players[i].boardId].color;

  const put = (html, zoneId, steps, { du = 0, dv = 0, title = '' } = {}) => {
    const { u, v } = zoneCenter(ZONES_BY_ID[zoneId]);
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild;
    el.dataset.steps = steps;
    if (title) el.title = title;
    return board.place(el, u + du, v + dv);
  };

  put(`<div class="tok tok-calendar">${game.month}</div>`, `month-${game.month}`, '2', { title: 'Ficha de Calendario' });

  // Paso 5: primavera boca arriba en la calle; el resto, boca abajo en su círculo del calendario.
  game.market.fish.forEach((_, i) => put('<div class="tok tok-fish">Pez</div>', `fish-${i + 1}`, '5', { title: 'Pescado de Primavera' }));
  [...game.market.pipes.map(() => ['pipe', 'Pipa']), ...game.market.bags.map(() => ['bag', 'Tab'])].forEach(([kind, label], i) =>
    put(`<div class="tok tok-${kind}">${label}</div>`, `pipe-${i + 1}`, '5', { title: kind === 'pipe' ? 'Pipa de Primavera' : 'Bolsa de Tabaco de Primavera' }));
  Object.keys(game.marketFaceDown).forEach((season) =>
    put('<div class="tok tok-facedown"></div>', `season-${season}`, '5', { title: 'Pescado, Pipas y Tabaco de la estación, boca abajo' }));

  put(`<div class="tok tok-fire-tiles"><i></i><i></i><i></i><i>${game.fireTiles.length}</i></div>`, 'fire-tiles', '4', { title: 'Losetas de Incendio' });

  game.turnOrder.forEach((pi, k) => {
    const style = `--player-color:${color(pi)}`;
    const n = game.players.length;
    put(`<div class="tok tok-lap" style="${style}">30</div>`, 'score-lap', '3', { du: -0.006 + k * 0.012, dv: -k * 0.01, title: 'Ficha 30/60 IKI' });
    put(`<div class="pawn oyakata" style="${style}">${k === 0 ? '1' : ''}</div>`, game.players[pi].oyakata, '10', { title: 'Oyakata' });
    // La pila de Extinción: la ficha de arriba se dibuja más arriba y por encima.
    put(`<div class="tok tok-fire" style="${style};z-index:${10 - k}"></div>`, 'fire-0', '11', { dv: (k - (n - 1) / 2) * 0.009, title: `Extinción de Incendios · ${k + 1}.ª de la pila` });
    put(`<div class="tok tok-score" style="${style}"></div>`, 'score-0', '12', { du: [-0.012, 0.012, -0.022, 0.022][k], dv: k < 2 ? -0.012 : 0.008, title: 'Puntuación' });
  });

  // Paso 13: personajes en sus solares y, mientras se eligen, los solares exteriores libres como destino.
  for (const [lotId, lot] of Object.entries(game.lots)) {
    const zone = ZONES_BY_ID[lotId];
    const card = createCharacterCard(CHARACTERS_BY_ID[lot.card]);
    card.style.width = `${zone.w * 100 * 0.92}%`;
    card.dataset.steps = '13';
    const kobun = document.createElement('span');
    kobun.className = 'pawn kobun-on-card';
    kobun.style.setProperty('--player-color', color(lot.owner));
    card.append(kobun);
    const { u, v } = zoneCenter(zone);
    board.place(card, u, v);
  }
  if (game.phase === 'initial-characters') {
    for (const lotId of freeOuterLots(game)) {
      const zone = ZONES_BY_ID[lotId];
      const target = document.createElement('button');
      target.type = 'button';
      target.className = `lot-target${selectedCard ? ' armed' : ''}`;
      target.dataset.steps = '13';
      target.title = selectedCard ? `Colocar ${CHARACTERS_BY_ID[selectedCard].name} aquí` : 'Solar exterior libre: elige antes una carta';
      target.style.width = `${zone.w * 100}%`;
      target.style.height = `${zone.h * 100}%`;
      target.disabled = !selectedCard;
      target.addEventListener('pointerdown', (e) => e.stopPropagation()); // que no arrastre el tablero
      target.addEventListener('click', () => onPlace(lotId));
      const { u, v } = zoneCenter(zone);
      board.place(target, u, v);
    }
  }
}
