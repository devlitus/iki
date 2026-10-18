import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { MARKET_BY_ID, describeToken } from '../data/market.ts';
import { SEASONS } from '../data/decks.ts';
import { CHARACTER_TYPES } from '../data/characters.ts';
import { activePlayer } from '../game/setup.ts';
import { playerStats, SPECIALS, MAX_FISH, MAX_TYPES } from '../game/playerStats.ts';

/**
 * Modal con el tablero de un jugador: la imagen tumbada a todo el ancho y debajo su información en tres
 * columnas, con la puntuación final estimada. Esc o clic fuera lo cierran; ← → cambian de jugador.
 */

const RESOURCES = [['mon', 'Mons'], ['rice', 'Arroz'], ['wood', 'Madera'], ['sandal', 'Sandalias'], ['koban', 'Koban']];

const row = (label, value, hint = '') => `<div${hint ? ` title="${hint}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
/** Sin fichas especiales, la fila genérica; con ellas, una fila por ficha con su propia imagen. */
const specialRows = (ids) => (ids.length
  ? ids.map((id) => row(`<span class="ic ic-special-${id}"></span>${SPECIALS[id] ?? id}`, '✓')).join('')
  : row('<span class="ic ic-special"></span>Especiales', '—'));
const list = (items, empty) => (items.length ? `<ul>${items.join('')}</ul>` : `<p class="muted">${empty}</p>`);
/**
 * Fichas de mercado compradas, sobre sus círculos del tablero: un Pescado por estación y las Pipas y Bolsas de Tabaco
 * en su círculo (apiladas con un pequeño desplazamiento si hay varias).
 */
function marketPieces(board, player) {
  const piece = (id, [x, y], k = 0) => {
    const t = MARKET_BY_ID[id];
    const style = `left: ${(x + k * 0.011) * 100}%; top: ${(y - k * 0.06) * 100}%; z-index: ${k + 1}`;
    return t.image
      ? `<img class="mkt-piece" src="${t.image}" alt="${describeToken(t)}" title="${describeToken(t)}" style="${style}" draggable="false">`
      : `<span class="mkt-piece mkt-plain" title="${describeToken(t)}" style="${style}">${t.cost}</span>`;
  };
  const season = (id) => SEASONS.findIndex((s) => s.id === MARKET_BY_ID[id].season);
  return [
    ...player.fish.map((id) => piece(id, board.market.fish[season(id)])),
    ...player.pipes.map((id, k) => piece(id, board.market.pipe, k)),
    ...player.tobacco.map((id, k) => piece(id, board.market.bag, k)),
  ].join('');
}

/** Sandalias sobre su recuadro del tablero: una pila (como mucho 4 fichas a la vista) con el total si hay más de una. */
function sandalPieces(board, n) {
  if (!n) return '';
  const [x, y] = board.sandalSlot;
  const label = `${n} sandalia${n > 1 ? 's' : ''}`;
  return Array.from({ length: Math.min(n, 4) }, (_, k) =>
    `<img class="sandal-piece" src="/tokens/resource/sandals.webp" alt="" style="left: ${(x + k * 0.0025) * 100}%; top: ${(y - k * 0.02) * 100}%; z-index: ${k + 1}" draggable="false">`).join('')
    + `<span class="sandal-count" role="img" aria-label="${label}" title="${label}" style="left: ${(x + 0.017) * 100}%; top: ${(y + 0.2) * 100}%">${n > 1 ? `×${n}` : ''}</span>`;
}

const typeDot = (type) => (type ? `<span class="type-dot" style="--type-color: ${CHARACTER_TYPES[type].color}" title="${CHARACTER_TYPES[type].label}"></span>` : '');

export function createPlayerModal() {
  const dialog = document.createElement('dialog');
  dialog.id = 'player-modal';
  dialog.setAttribute('aria-labelledby', 'player-modal-title');
  document.body.append(dialog);

  let game = null;
  let index = 0;

  function render() {
    const p = game.players[index];
    const board = PLAYER_BOARDS_BY_ID[p.boardId];
    const st = playerStats(game, index);
    const n = game.players.length;
    dialog.style.setProperty('--player-color', board.color);
    dialog.innerHTML = `
      <header>
        <h2 id="player-modal-title">${board.name}</h2>
        ${index === activePlayer(game) ? '<span class="badge playing">jugando</span>' : ''}
        ${index === game.starter ? '<span class="badge">inicial</span>' : ''}
        <span class="muted">Jugador ${index + 1} de ${n}</span>
        <span class="actions">
          <button type="button" class="btn nav" data-step="-1" aria-label="Jugador anterior">←</button>
          <button type="button" class="btn nav" data-step="1" aria-label="Jugador siguiente">→</button>
          <button type="button" class="btn close" aria-label="Cerrar">×</button>
        </span>
      </header>
      <div class="board-strip"><img src="${board.image}" alt="Tablero de jugador ${board.name}" draggable="false">
        ${board.kobunSlots.slice(0, st.kobunFree).map(([x, y]) =>
          `<img class="kobun-free" src="/pawns/kobun-${board.id}.webp" alt="Kobun libre" style="left: ${x * 100}%; top: ${y * 100}%" draggable="false">`).join('')}
        ${sandalPieces(board, st.resources.sandal)}
        ${marketPieces(board, p)}</div>
      <div class="cols">
        <section>
          <h3>Recursos y peones</h3>
          <dl>
            ${RESOURCES.map(([res, label]) => row(`<span class="ic ic-${res}"></span>${label}`, st.resources[res])).join('')}
            ${specialRows(p.specials)}
          </dl>
          <dl>
            ${row('Kobun libres', `${st.kobunFree}/${st.kobunTotal}`, 'Hace falta uno libre para contratar o construir')}
            ${row('Ikizama', st.ikizama)}
            ${row('Oyakata', st.oyakata)}
          </dl>
        </section>
        <section>
          <h3>Marcadores y colección</h3>
          <dl>
            ${row('IKI', st.iki)}
            ${row('Extinción de Incendios', `nivel ${st.fire} · ${st.fireStack}.º en la pila`, 'Decide el orden del Ikizama desde el mes 2 y desempata al final')}
            ${row('Orden de turno', `${st.turn}.º`)}
          </dl>
          <dl>
            ${row('Pescado', `${st.fish}/${MAX_FISH}`, 'Uno por estación')}
            ${row('Pipas', st.pipes)}
            ${row('Bolsas de Tabaco', st.tobacco + (st.pipes ? ' (×2 por la Pipa)' : ''), 'Con al menos una Pipa, el Tabaco puntúa el doble')}
          </dl>
        </section>
        <section>
          <h3>Personajes y edificios</h3>
          <h4>Contratados · ${st.hired.length}</h4>
          ${list(st.hired.map((c) => `<li>${typeDot(c.type)}${c.name}</li>`), 'Ninguno')}
          <p class="muted">Día de Pago: ${st.rice} de arroz</p>
          <h4>Retirados · ${st.retired.length}</h4>
          ${list(st.retired.map((c) => `<li>${typeDot(c.type)}${c.name}</li>`), 'Ninguno')}
          <h4>Variedad · ${st.types.length}/${MAX_TYPES}</h4>
          <p class="muted">${st.types.length ? st.types.join(', ') : 'Ningún tipo'}</p>
          <h4>Edificios · ${st.buildings.length}</h4>
          ${list(st.buildings.map((b) => `<li>${b}</li>`), 'Ninguno')}
        </section>
      </div>
      <footer title="Sin el extra del pescado más caro, el Tabaco ni los Edificios, que aún no se registran">
        <span class="label">Puntuación final estimada</span>
        <span>Marcador ${st.score.track}</span>
        <span>Variedad ${st.score.variety}</span>
        <span>Pescado ${st.score.fish}</span>
        <span>Tabaco ${st.score.tobacco}</span>
        <span>Edificios ${st.score.buildings}</span>
        <span>Recursos ${st.score.resources}</span>
        <b>= ${st.score.total} IKI</b>
      </footer>`;
  }

  function step(delta) {
    index = (index + delta + game.players.length) % game.players.length;
    render();
  }

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('.close')) return dialog.close();
    const nav = e.target.closest('.nav');
    if (nav) step(Number(nav.dataset.step));
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  return {
    open(state, playerIndex) {
      game = state;
      index = playerIndex;
      render();
      if (!dialog.open) dialog.showModal();
    },
    /** Tras un cambio en la partida, redibuja el modal si está abierto. */
    update(state) {
      game = state;
      if (dialog.open) render();
    },
  };
}
