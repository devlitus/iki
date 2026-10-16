import { createBoard } from './board.js';
import { createZonesOverlay } from './zonesOverlay.js';
import { ZONES_BY_ID } from './data/zones.js';
import './cards/card.css';
import { createBoardPicker } from './players/boardPicker.js';
import './players/players.css';
import { createGame, freeOuterLots, MIN_PLAYERS, GAME_VERSION } from './game/setup.js';
import { act, whoseTurn } from './game/engine.js';
import { randomSeed } from './game/random.js';
import { renderDecks, renderSupply, renderPlayers, createStepsDrawer } from './view/table.js';
import { renderBoardPieces } from './view/boardPieces.js';
import { renderTurnPanel, bindTurnPanel, boardTargets, hireableCards } from './view/turnPanel.js';
import { createCover } from './view/cover.js';
import { createEventSummary, createFinalTable, initZoom } from './view/dialogs.js';
import { createPlayerModal } from './view/playerModal.js';
import { CHARACTERS_BY_ID } from './data/characters.js';
import './view/table.css';
import './view/turn.css';

const board = await createBoard({
  viewport: document.getElementById('viewport'),
  board: document.getElementById('board'),
  image: document.getElementById('board-image'),
  pieces: document.getElementById('pieces'),
});

// Herramienta de desarrollo: Alt + clic marca un punto y muestra/copia sus coordenadas (u, v),
// para ir mapeando las casillas del tablero.
const toast = document.getElementById('toast');
const marker = document.createElement('div');
marker.className = 'coord-marker';

document.getElementById('viewport').addEventListener('click', (e) => {
  if (!e.altKey) return;
  const uv = board.clientToUV(e.clientX, e.clientY);
  if (!uv) return;
  const text = `u: ${uv.u.toFixed(4)}, v: ${uv.v.toFixed(4)}`;
  board.place(marker, uv.u, uv.v);
  toast.textContent = text;
  toast.hidden = false;
  navigator.clipboard?.writeText(`{ u: ${uv.u.toFixed(4)}, v: ${uv.v.toFixed(4)} }`).catch(() => {});
  console.log(text);
});

// Herramienta de desarrollo: la tecla Z muestra/oculta las zonas mapeadas.
const zonesOverlay = createZonesOverlay(document.getElementById('board'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'z' || e.key === 'Z') zonesOverlay.toggle();
});

// --- Partida ---------------------------------------------------------------------------------
const GAME_KEY = 'iki.game';
const MAX_UNDO = 40;
let game = loadGame();
let selectedCard = null; // paso 13: carta inicial elegida, a la espera del solar
let ui = {}; // lo que el jugador va eligiendo en su turno antes de confirmar (ver view/turnPanel.js)
let history = []; // estados anteriores del turno en curso, para deshacer

const app = document.getElementById('app');
const turnEl = document.getElementById('turn');
const steps = createStepsDrawer({
  drawer: document.getElementById('steps'),
  toggle: document.getElementById('open-steps'),
  root: app,
});
const btnReroll = document.getElementById('reroll');
const btnSteps = document.getElementById('open-steps');
const playerModal = createPlayerModal();
const eventSummary = createEventSummary();
const finalTable = createFinalTable({ onNewGame: () => openPicker() });
initZoom();

/** Todo lo que el panel de turno necesita para pintar y para actuar. */
const turnCtx = () => ({ game, ui, set, dispatch, undo, canUndo: history.length > 0, openFinal: () => finalTable.open(game) });
bindTurnPanel(turnEl, turnCtx);

function render() {
  if (!game) return;
  const playing = game.phase !== 'initial-characters';
  app.classList.toggle('playing', playing);
  turnEl.hidden = !playing;
  btnSteps.hidden = playing;
  btnReroll.hidden = playing;
  if (playing) renderTurnPanel(turnEl, game, turnCtx());

  renderDecks(document.getElementById('decks'), game, {
    selectedCard, onSelectCard: (id) => { selectedCard = id; render(); },
    hireable: hireableCards(game), hiring: ui.hire, onSelectHire: (card) => set({ hire: card, building: null }),
  });
  renderSupply(document.getElementById('supply'), game);
  renderPlayers(document.getElementById('players'), game, { onOpenBoard: (i) => playerModal.open(game, i) });
  playerModal.update(game);
  renderBoardPieces(board, game, { targets: targets() });
  btnReroll.disabled = Object.keys(game.lots).length > 0;
  steps.refresh();
}

/** Zonas del tablero que se pueden pulsar: los solares exteriores en el paso 13 y, en juego, lo que pida el turno. */
function targets() {
  if (game.phase !== 'initial-characters') return boardTargets(game, turnCtx());
  if (!selectedCard) return [];
  return freeOuterLots(game).map((lot) => ({
    zone: lot, title: `Colocar ${CHARACTERS_BY_ID[selectedCard].name} aquí`, onClick: () => dispatch({ type: 'placeInitial', card: selectedCard, lot }),
  }));
}

/** Cambia lo que el jugador está eligiendo (sin tocar la partida) y redibuja. */
function set(patch) {
  ui = { ...ui, ...patch, error: null };
  render();
}

/** ¿Es la misma "mano" (mismo jugador, misma fase)? Entonces la jugada anterior se puede deshacer. */
const turnKey = (g) => [g.phase, whoseTurn(g), g.turn?.index, g.month, Boolean(g.pending)].join('|');

/** Aplica una acción al motor; si no es válida, lo dice en el panel y deja la partida como estaba. */
function dispatch(action) {
  const before = game;
  let next;
  try {
    next = act(before, action);
  } catch (error) {
    ui = { ...ui, error: error.message };
    return render();
  }
  history = turnKey(before) === turnKey(next) ? [...history, before].slice(-MAX_UNDO) : [];
  game = next;
  selectedCard = null;
  ui = {};
  saveGame(game);
  render();
  eventSummary.show(game, game.log.filter((e) => e.seq > (before.logSeq ?? 0)));
  if (game.phase === 'ended' && before.phase !== 'ended') finalTable.open(game);
}

function undo() {
  if (!history.length) return;
  game = history.at(-1);
  history = history.slice(0, -1);
  ui = {};
  saveGame(game);
  render();
}

function newGame(players) {
  game = createGame({ players: players.map(({ boardId }) => ({ boardId })), seed: randomSeed() });
  selectedCard = null;
  ui = {};
  history = [];
  saveGame(game);
  render();
}

btnReroll.addEventListener('click', () => newGame(game.players));

// Portada y tableros de jugador: «Nueva partida» abre el selector; al pulsar Empezar se prepara una partida nueva.
const cover = createCover({ onNew: () => openPicker({ fromCover: true }), onContinue: () => {} });
let pickerFromCover = false;
const picker = createBoardPicker({
  onDone: (players) => { if (players.length >= MIN_PLAYERS) newGame(players); },
  onCancel: () => { if (pickerFromCover) cover.show(Boolean(game)); },
});
function openPicker({ fromCover = false } = {}) {
  pickerFromCover = fromCover;
  picker.open();
}
document.getElementById('open-picker').addEventListener('click', () => openPicker());
document.getElementById('open-menu').addEventListener('click', () => cover.show(Boolean(game)));
window.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') && !e.target.closest?.('#board-picker, #player-modal, #cover, select, input')) openPicker();
});
if (game) render();
cover.show(Boolean(game));

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_KEY) ?? 'null');
    return saved?.version === GAME_VERSION ? saved : null;
  } catch {
    return null;
  }
}

function saveGame(state) {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(state));
  } catch {
    // Sin almacenamiento: la partida dura lo que la pestaña.
  }
}

// Expuesto para depurar desde la consola.
window.iki = { board, zones: ZONES_BY_ID, picker, dispatch, get game() { return game; } };
