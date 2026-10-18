import { PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { SEASONS, BUILDINGS_BY_ID, BUILDING_BACK } from '../data/decks.ts';
import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { currentPicker, activePlayer } from '../game/setup.ts';
import { seasonOf } from '../game/engine.ts';
import { esc, isWaiting, playerName } from './format.ts';
import { playerStats, SPECIALS, MAX_FISH, MAX_TYPES } from '../game/playerStats.ts';
import type { Game, Resources } from '../types.ts';

/**
 * Mesa alrededor del tablero: mazos, edificios y reserva en la columna izquierda; los jugadores en la
 * derecha, en fichas compactas con el activo arriba.
 */

export const resourceChips = ({ mon, rice, sandal, wood, koban }: Resources) => ([
  ['mon', mon, 'Mons'], ['rice', rice, 'Arroz'], ['sandal', sandal, 'Sandalias'], ['wood', wood, 'Madera'], ['koban', koban, 'Koban'],
] satisfies [string, number, string][]).filter(([, n], i) => n > 0 || i < 3)
  .map(([res, n, label]) => `<span class="res" title="${label}"><span class="ic ic-${res}"></span>×${n}</span>`).join('');

/**
 * Mazos de Personaje (paso 8) y, debajo, los personajes iniciales (paso 13A) o, ya en juego, la fila de cartas del
 * mes con los mons que tiene encima cada una. En la fase B1 se pueden pulsar las que el jugador de turno puede contratar.
 */
export function renderDecks(el: HTMLElement, game: Game, { selectedCard, onSelectCard, hireable = new Set(), hiring = null, onSelectHire }: {
  selectedCard: string | null;
  onSelectCard: (card: string | null) => void;
  hireable?: Set<string>;
  hiring?: string | null;
  onSelectHire?: (card: string | null) => void;
}) {
  const picker = currentPicker(game);
  const humanPicker = picker != null && !isWaiting(game); // cuando elige la IA u otra persona, las cartas no se pueden pulsar
  // La estación en curso se resalta y las ya pasadas se apagan.
  const current = SEASONS.indexOf(seasonOf(game.month));
  const decks = SEASONS.map((s, i) => `
    <div class="deck${i === current ? ' current' : i < current ? ' past' : ''}"
      title="Mazo de ${s.name}: ${game.decks[s.id].length} cartas${i === current ? ' · estación en curso' : ''}">
      <div class="pile"><img src="${s.back}" alt=""><img src="${s.back}" alt=""><img src="${s.back}" alt="Mazo de ${s.name}"></div>
      <span>${s.name}<br>${game.decks[s.id].length}</span>
    </div>`).join('');

  let lower: string;
  if (game.initialCharacters.length) {
    lower = `<div class="initial-row">
        <span class="label">Personajes iniciales${picker != null ? ` · elige ${playerName(game, picker)}` : ''}</span>
        <div class="initial-cards">${game.initialCharacters.map((id) => `
          <button type="button" class="initial-card${id === selectedCard ? ' selected' : ''}" data-card="${id}" data-zoom="${CHARACTERS_BY_ID[id].scan}"
            ${humanPicker ? '' : 'disabled'} title="${CHARACTERS_BY_ID[id].name}">
            <img src="${CHARACTERS_BY_ID[id].scan}" alt="${CHARACTERS_BY_ID[id].name}" draggable="false">
          </button>`).join('')}</div>
        <p>${picker != null && !humanPicker ? `${game.players[picker].ai ? 'La IA está' : `${playerName(game, picker)} está`} eligiendo su personaje…` : selectedCard ? 'Ahora pulsa un solar exterior libre del tablero.' : 'Pulsa una carta y después un solar exterior libre.'}</p>
      </div>`;
  } else if (game.phase !== 'initial-characters') {
    const choosing = game.phase === 'actions' && game.turn?.step === 'b1';
    lower = `<div class="initial-row"><span class="label">Fila de personajes · ${game.row.length}</span>
        <div class="initial-cards row-cards${choosing ? ' choosing' : ''}">${game.row.map(({ card, mons }) => `
          <button type="button" class="initial-card${card === hiring ? ' selected' : ''}" data-hire="${card}" data-zoom="${CHARACTERS_BY_ID[card].scan}"
            ${hireable.has(card) ? '' : 'disabled'} title="${CHARACTERS_BY_ID[card].name} · cuesta ${CHARACTERS_BY_ID[card].cost} mons${mons ? ` (con ${mons} mons encima)` : ''}">
            <img src="${CHARACTERS_BY_ID[card].scan}" alt="${CHARACTERS_BY_ID[card].name}" draggable="false">
            ${mons ? `<span class="mons-on-card" title="${mons} mons encima: ayudan a pagar la carta"><span class="ic ic-mon"></span>${mons}</span>` : ''}
          </button>`).join('')}</div>
        <p class="muted">${game.row.length ? 'Los mons de encima se los queda quien la contrate.' : 'No quedan cartas este mes.'}</p></div>`;
  } else {
    lower = `<div class="initial-row"><span class="label">Fila de personajes</span>
        <div class="row-slots">${'<span class="slot"></span>'.repeat(4)}</div>
        <p>Cada mes se muestran 4 cartas de la estación.</p></div>`;
  }

  el.innerHTML = `<div class="decks">${decks}</div>${lower}`;
  el.querySelectorAll<HTMLElement>('.initial-card[data-card]').forEach((b) =>
    b.addEventListener('click', () => onSelectCard(b.dataset.card === selectedCard ? null : b.dataset.card!)));
  el.querySelectorAll<HTMLElement>('.initial-card[data-hire]').forEach((b) =>
    b.addEventListener('click', () => onSelectHire?.(b.dataset.hire === hiring ? null : b.dataset.hire!)));
}

/** Edificios (paso 6) y reserva (paso 7). */
export function renderSupply(el: HTMLElement, game: Game) {
  el.innerHTML = `
    <section class="panel">
      <span class="label">Edificios · ${game.buildings.length} al azar</span>
      <div class="buildings">${game.buildings.map((id) =>
        `<img src="${BUILDINGS_BY_ID[id].image}" alt="${BUILDINGS_BY_ID[id].name}" title="${BUILDINGS_BY_ID[id].name}" data-zoom="${BUILDINGS_BY_ID[id].image}" draggable="false">`).join('')}</div>
      <div class="box" title="${game.buildingsBox.map((id) => BUILDINGS_BY_ID[id].name).join(', ')}">
        <img src="${BUILDING_BACK}" alt="">Los otros ${game.buildingsBox.length} vuelven a la caja
      </div>
    </section>
    <section class="panel">
      <span class="label">Reserva · sin límite</span>
      <div class="reserve">
        <span class="res"><span class="ic ic-mon"></span>Mons</span>
        <span class="res"><span class="ic ic-rice"></span>Arroz</span>
        <span class="res"><span class="ic ic-wood"></span>Madera</span>
        <span class="res"><span class="ic ic-sandal"></span>Sandalias</span>
        <span class="res"><span class="ic ic-koban"></span>Koban</span>
        <span class="res" title="Mover +1, Evitar un incendio ×2, Comodín, Contratar −1"><span class="ic ic-special"></span>Especiales</span>
      </div>
    </section>`;
}

/**
 * Una ficha compacta por jugador (pasos 9-13), empezando por el activo. Al pulsar la ficha se abre su
 * tablero de jugador en un modal (`onOpenBoard(index)`) con toda su información.
 */
export function renderPlayers(el: HTMLElement, game: Game, { onOpenBoard }: { onOpenBoard: (index: number) => void }) {
  const picker = currentPicker(game);
  const active = activePlayer(game);
  // Debajo del activo, los siguientes: en el paso 13 por orden de elección, después por orden de turno.
  const sequence = picker != null ? game.pickOrder
    : (game.phase === 'actions' || game.phase === 'newyear') && game.turnList ? game.turnList
    : game.phase === 'ikizama' ? game.order! : game.turnOrder;
  const from = sequence.indexOf(active);
  const order = [...sequence.slice(from), ...sequence.slice(0, from)];

  el.innerHTML = order.map((index) => {
    const p = game.players[index];
    const board = PLAYER_BOARDS_BY_ID[p.boardId];
    const st = playerStats(game, index);
    const lot = Object.entries(game.lots).find(([, l]) => l.owner === index && l.initial);
    return `
      <article class="seat${index === active ? ' active' : ''}${picker === index ? ' picking' : ''}" data-player="${index}" style="--player-color: ${board.color}" title="Ver el tablero de ${board.name}">
        <header class="who">
          <h3>${board.name}</h3>
          ${p.ai ? '<span class="badge" title="Lo juega la IA">IA</span>' : ''}
          ${p.userName ? `<span class="badge user" title="Jugador">${esc(p.userName)}${index === game.viewer ? ' (tú)' : ''}</span>` : ''}
          ${index === active && game.phase !== 'ended' ? '<span class="badge playing">jugando</span>' : ''}
          ${index === game.starter ? '<span class="badge">inicial</span>' : ''}
          <button type="button" class="btn btn-sm open-board">Tablero</button>
        </header>
        <div class="chips">${resourceChips(p.resources)}${p.specials.map((id) =>
          `<span class="res" title="${SPECIALS[id] ?? id}"><span class="ic ic-special-${id}"></span></span>`).join('')}</div>
        <dl class="facts">
          <div title="Kobun libres para contratar o construir"><dt>Kobun</dt><dd>${st.kobunFree}/${st.kobunTotal}</dd></div>
          <div title="Puntos de IKI en el marcador"><dt>IKI</dt><dd>${st.iki}</dd></div>
          <div title="Nivel de Extinción de Incendios y posición en la pila"><dt>Incendios</dt><dd>${st.fire} · ${st.fireStack}.º</dd></div>
          <div title="Pescados de estaciones distintas"><dt>Pescado</dt><dd>${st.fish}/${MAX_FISH}</dd></div>
          <div title="Pipas y Bolsas de Tabaco"><dt>Pipa · Tabaco</dt><dd>${st.pipes} · ${st.tobacco}</dd></div>
          <div title="Tipos de Personaje distintos contratados"><dt>Variedad</dt><dd>${st.types.length}/${MAX_TYPES}</dd></div>
        </dl>
        <p class="status muted">${picker != null || game.phase === 'ready' || game.phase === 'initial-characters' ? `
          <span>Turno ${st.turn}.º</span>
          <span>${lot
            ? `${CHARACTERS_BY_ID[lot[1].card].name}`
            : picker === index ? '<b>Elige personaje inicial</b>' : `Elige personaje ${game.pickOrder.indexOf(index) + 1}.º`}</span>` : `
          <span title="Casilla del marcador de Ikizama">Ikizama: ${p.ikizama ?? 'en su tablero'}</span>
          <span title="Casilla de la calle donde está su Oyakata">${st.oyakata}</span>`}
        </p>
      </article>`;
  }).join('');
  // Toda la ficha abre el tablero; el botón es el destino para el teclado.
  el.querySelectorAll<HTMLElement>('.seat').forEach((s) => s.addEventListener('click', () => onOpenBoard(Number(s.dataset.player))));
}

/** Las fichas especiales de la reserva y lo que hace cada una (reglamento, «Fichas especiales»). */
const SPECIAL_TOKENS = [
  ['move-plus-1', 'Mover +1', 'Tu Oyakata puede moverse un espacio más en la fase de Acciones.'],
  ['hire-minus-1', 'Contratar −1', 'Contratar personajes te cuesta 1 mon menos.'],
  ['fire-ward', 'Evitar un incendio (×2)', 'Una vez por partida, descártala para que uno de tus personajes no muera en un incendio.'],
  ['wildcard', 'Comodín', 'Va sobre el Marionetista: al final eliges de qué tipo es y en qué columna de tu tablero va.'],
];

/** Desplegable de la barra lateral con las fichas especiales y su efecto. */
export function renderSpecialsInfo(el: HTMLElement) {

  el.innerHTML = `<summary class="btn">Fichas especiales</summary>
    <ul>${SPECIAL_TOKENS.map(([file, name, text]) => `
      <li><img src="/tokens/special/${file}.webp" alt="" draggable="false"><span><b>${name}</b><span class="d">${text}</span></span></li>`).join('')}</ul>`;
}
