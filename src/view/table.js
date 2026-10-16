import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.js';
import { SEASONS, BUILDINGS_BY_ID, BUILDING_BACK } from '../data/decks.js';
import { CHARACTERS_BY_ID } from '../data/characters.js';
import { currentPicker } from '../game/setup.js';

/**
 * Mesa alrededor del tablero: mazos arriba, edificios y reserva a la derecha, un asiento por jugador en
 * cada lado del tablero. Todo lo que dibuja un paso de la preparación lleva `data-steps` para que el
 * panel de pasos lo pueda resaltar.
 */

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const die = (value, cls = '') => `<span class="die ${cls}" role="img" aria-label="Dado: ${value}">${
  Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[value].includes(i) ? 'pip' : ''}"></i>`).join('')}</span>`;

const resourceChips = ({ mon, rice, sandal, wood, koban }) => [
  ['mon', mon, 'Mons'], ['rice', rice, 'Arroz'], ['sandal', sandal, 'Sandalias'], ['wood', wood, 'Madera'], ['koban', koban, 'Koban'],
].filter(([, n], i) => n > 0 || i < 3)
  .map(([res, n, label]) => `<span class="res" title="${label}"><span class="ic ic-${res}"></span>×${n}</span>`).join('');

/** Mazos de Personaje (paso 8) y personajes iniciales (paso 13A), encima del tablero. */
export function renderDecks(el, game, { selectedCard, onSelectCard }) {
  const picker = currentPicker(game);
  const decks = SEASONS.map((s) => `
    <div class="deck" data-steps="8" title="Mazo de ${s.name}: ${game.decks[s.id].length} cartas">
      <div class="pile">${s.back
        ? `<img src="${s.back}" alt=""><img src="${s.back}" alt=""><img src="${s.back}" alt="Mazo de ${s.name}">`
        : '<span class="blank">sin escanear</span>'}</div>
      <span>${s.name} · ${game.decks[s.id].length}</span>
    </div>`).join('');

  const initial = game.initialCharacters.length
    ? `<div class="initial-row" data-steps="13">
        <span class="label">Personajes iniciales${picker != null ? ` · elige ${PLAYER_BOARDS_BY_ID[game.players[picker].boardId].name}` : ''}</span>
        <div class="initial-cards">${game.initialCharacters.map((id) => `
          <button type="button" class="initial-card${id === selectedCard ? ' selected' : ''}" data-card="${id}"
            ${picker == null ? 'disabled' : ''} title="${CHARACTERS_BY_ID[id].name}">
            <img src="${CHARACTERS_BY_ID[id].scan}" alt="${CHARACTERS_BY_ID[id].name}" draggable="false">
          </button>`).join('')}</div>
        <p>${selectedCard ? 'Ahora pulsa un solar exterior libre del tablero.' : 'Pulsa una carta y después un solar exterior libre.'}</p>
      </div>`
    : `<div class="initial-row"><span class="label">Fila de personajes</span>
        <div class="row-slots">${'<span class="slot"></span>'.repeat(4)}</div>
        <p>El mes 1 empieza mostrando 4 cartas de Primavera.</p></div>`;

  el.innerHTML = decks + initial;
  el.querySelectorAll('.initial-card').forEach((b) =>
    b.addEventListener('click', () => onSelectCard(b.dataset.card === selectedCard ? null : b.dataset.card)));
}

/** Edificios (paso 6) y reserva (paso 7), a la derecha. */
export function renderSide(el, game) {
  el.innerHTML = `
    <section class="panel" data-steps="6">
      <span class="label">Edificios · ${game.buildings.length} al azar</span>
      <div class="buildings">${game.buildings.map((id) =>
        `<img src="${BUILDINGS_BY_ID[id].image}" alt="${BUILDINGS_BY_ID[id].name}" title="${BUILDINGS_BY_ID[id].name}" draggable="false">`).join('')}</div>
      <div class="box" title="${game.buildingsBox.map((id) => BUILDINGS_BY_ID[id].name).join(', ')}">
        <img src="${BUILDING_BACK}" alt="">Los otros ${game.buildingsBox.length} vuelven a la caja
      </div>
    </section>
    <section class="panel" data-steps="7">
      <span class="label">Reserva · sin límite</span>
      <div class="reserve">
        <span class="res"><span class="ic ic-mon"></span>Mons</span>
        <span class="res"><span class="ic ic-rice"></span>Arroz</span>
        <span class="res"><span class="ic ic-wood"></span>Madera</span>
        <span class="res"><span class="ic ic-sandal"></span>Sandalias</span>
        <span class="res"><span class="ic ic-koban"></span>Koban</span>
        <span class="res" title="Mover +1, Evitar un incendio ×2, Comodín, Contratar −1"><span class="ic ic-special">★</span>Especiales</span>
      </div>
    </section>`;
}

/** Un asiento por jugador en su lado del tablero (pasos 9-13). */
export function renderSeats(slots, game) {
  const picker = currentPicker(game);
  for (const [seat, el] of Object.entries(slots)) {
    const index = game.players.findIndex((p) => p.seat === seat);
    el.hidden = index < 0;
    if (index < 0) { el.replaceChildren(); continue; }

    const p = game.players[index];
    const board = PLAYER_BOARDS_BY_ID[p.boardId];
    const turn = game.turnOrder.indexOf(index);
    const pick = game.pickOrder.indexOf(index);
    const lot = Object.entries(game.lots).find(([, l]) => l.owner === index && l.initial);
    const vertical = seat === 'left' || seat === 'right';

    el.className = `seat seat-${seat} ${vertical ? 'v' : 'h'}${picker === index ? ' picking' : ''}`;
    el.dataset.steps = '9 10 11 12 13';
    el.style.setProperty('--player-color', board.color);
    el.innerHTML = `
      <div class="strip"><img src="${board.image}" alt="Tablero de jugador ${board.name}" draggable="false"></div>
      <div class="who">
        <h3>${board.name}</h3>
        <div class="dice" title="${p.rolls.length > 1 ? 'Tirada y desempates' : 'Tirada'}">
          ${p.rolls.map((r, i) => die(r, i < p.rolls.length - 1 ? 'tied' : (index === game.starter ? 'win' : ''))).join('')}
          ${index === game.starter ? '<span class="badge">inicial</span>' : ''}
        </div>
        <div class="chips">${resourceChips(p.resources)}</div>
        <div class="chips pieces" title="Ikizama y Kobun disponibles">
          <span class="ikizama"></span>${'<span class="kobun"></span>'.repeat(p.kobun)}
        </div>
        <span class="muted">Turno ${turn + 1}.º · pila ${turn === 0 ? 'arriba' : `${turn + 1}.ª`}</span>
        <span class="muted">${lot
          ? `${CHARACTERS_BY_ID[lot[1].card].name}`
          : picker === index ? '<b>Elige personaje inicial</b>' : `Elige personaje ${pick + 1}.º`}</span>
      </div>`;
  }
}

/** Panel lateral ocultable con los pasos de preparación; al pulsar uno se resaltan sus piezas. */
export const SETUP_STEPS = [
  [1, 'Tablero', 'Lado de 3-4 jugadores en el centro.'],
  [2, 'Calendario', 'Ficha en el mes 1.'],
  [3, 'Fichas 30/60 IKI', 'Una por jugador al final del marcador.'],
  [4, 'Losetas de Incendio', 'Las 4 mezcladas, boca abajo.'],
  [5, 'Pescado, Pipas y Tabaco', 'Primavera boca arriba; el resto boca abajo en el calendario.'],
  [6, 'Edificios', '6 de 10 al azar junto al tablero.'],
  [7, 'Reserva', 'Mons, sandalias, arroz, madera, Koban y fichas especiales.'],
  [8, 'Mazos de Personaje', 'Separados por estación.'],
  [9, 'Material del jugador', 'Tablero, peones, 8 mons, 1 arroz y 1 sandalia.'],
  [10, 'Jugador inicial y Oyakatas', 'Dados: el más alto empieza; los empatados repiten. Oyakatas en la zona inicial.'],
  [11, 'Extinción de Incendios', 'Fichas apiladas en el 0, la del inicial arriba.'],
  [12, 'Puntuación', 'Fichas en el 0 del marcador de IKI.'],
  [13, 'Personaje inicial', 'En sentido antihorario, cada uno pone uno en un solar exterior con un Kobun.'],
];

export function createStepsDrawer({ drawer, toggle, root }) {
  let current = null;
  drawer.innerHTML = `
    <div class="steps-head"><span class="label">Pasos de preparación</span>
      <button type="button" class="steps-close" aria-label="Cerrar pasos">×</button></div>
    <ol>${SETUP_STEPS.map(([n, title, text]) => `
      <li><button type="button" class="step" data-step="${n}" aria-pressed="false">
        <span class="n">${n}</span><span><b>${title}</b><span class="d">${text}</span></span>
      </button></li>`).join('')}</ol>`;

  function highlight() {
    root.classList.toggle('focus', current != null);
    root.querySelectorAll('[data-steps]').forEach((el) =>
      el.classList.toggle('on', current != null && el.dataset.steps.split(' ').includes(String(current))));
    drawer.querySelectorAll('.step').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === current)));
  }

  function setOpen(open) {
    drawer.classList.toggle('open', open);
    drawer.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) { current = null; highlight(); }
  }

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('.steps-close')) return setOpen(false);
    const step = e.target.closest('.step');
    if (!step) return;
    current = current === Number(step.dataset.step) ? null : Number(step.dataset.step);
    highlight();
  });
  toggle.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  setOpen(false);

  // Tras redibujar la mesa, vuelve a aplicar el resaltado del paso abierto.
  return { refresh: highlight };
}
