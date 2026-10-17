import { createBoard } from './board.js';
import { createZonesOverlay } from './zonesOverlay.js';
import { ZONES_BY_ID } from './data/zones.js';
import './cards/card.css';
import { createBoardPicker } from './players/boardPicker.js';
import './players/players.css';
import { createGame, freeOuterLots, MIN_PLAYERS, GAME_VERSION } from './game/setup.js';
import { act, whoseTurn } from './game/engine.js';
import { randomSeed } from './game/random.js';
import { chooseAction, isAiTurn } from './ai/player.js';
import { renderDecks, renderSupply, renderPlayers, createStepsDrawer } from './view/table.js';
import { renderBoardPieces } from './view/boardPieces.js';
import { renderTurnPanel, bindTurnPanel, boardTargets, hireableCards } from './view/turnPanel.js';
import { createCover } from './view/cover.js';
import { createEventSummary, createFinalTable, initZoom } from './view/dialogs.js';
import { createPlayerModal } from './view/playerModal.js';
import { createTutorial } from './tutorial/tutorial.js';
import { createTutorialGame } from './tutorial/game.js';
import { createOnline } from './online/online.js';
import { api } from './online/api.js';
import { isWaiting } from './view/format.js';
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
let tutorial = null; // el tutorial en marcha: guía el turno del humano y no toca la partida guardada
let online = null; // partida alojada en el servidor ({ id, version, me, seats, status }): allí se validan las jugadas y se juegan las IA

const app = document.getElementById('app');
const turnEl = document.getElementById('turn');
const steps = createStepsDrawer({
  drawer: document.getElementById('steps'),
  toggle: document.getElementById('open-steps'),
  root: app,
});
const btnReroll = document.getElementById('reroll');
const btnSteps = document.getElementById('open-steps');
const btnPicker = document.getElementById('open-picker');
const playerModal = createPlayerModal();
const eventSummary = createEventSummary();
const finalTable = createFinalTable({ onNewGame: () => openPicker() });
initZoom();

/** Todo lo que el panel de turno necesita para pintar y para actuar. */
const turnCtx = () => ({ game, ui, set, dispatch, undo, canUndo: history.length > 0, openFinal: () => finalTable.open(game) });
bindTurnPanel(turnEl, turnCtx);

/** Deja la mesa vacía, como antes de empezar ninguna partida. */
function clearTable() {
  app.classList.remove('playing');
  turnEl.hidden = true;
  ['decks', 'supply', 'players'].forEach((id) => document.getElementById(id).replaceChildren());
  board.pieces.replaceChildren();
}

function render() {
  if (!game) return clearTable();
  const playing = game.phase !== 'initial-characters';
  app.classList.toggle('playing', playing);
  turnEl.hidden = !playing;
  btnSteps.hidden = playing || Boolean(tutorial) || Boolean(online);
  btnReroll.hidden = playing || Boolean(tutorial) || Boolean(online);
  btnPicker.hidden = Boolean(tutorial) || Boolean(online);
  if (playing) renderTurnPanel(turnEl, game, turnCtx());

  renderDecks(document.getElementById('decks'), game, {
    selectedCard, onSelectCard: (id) => { selectedCard = id; render(); },
    hireable: hireableCards(game), hiring: ui.hire, onSelectHire: (card) => set({ hire: card, building: null }),
  });
  renderSupply(document.getElementById('supply'), game);
  renderPlayers(document.getElementById('players'), game, { onOpenBoard: (i) => playerModal.open(game, i) });
  playerModal.update(game);
  renderBoardPieces(board, game, { targets: targets() });
  tutorial?.update(game);
  btnReroll.disabled = Object.keys(game.lots).length > 0;
  steps.refresh();
  scheduleAi();
}

// --- Jugadores de IA ---------------------------------------------------------------------------
// Cuando le toca a una IA, tras una pausa (para que se vea lo que hace) elige y juega su acción. Espera mientras haya
// un diálogo abierto (resumen del Evento, tabla final), la portada o el selector de tableros.
const AI_DELAY = 700;
const AI_RETRY = 400;
let aiTimer = null;
let aiStalled = false; // la IA falló: no reintenta hasta que la partida cambie por otro lado

const aiBlocked = () => cover.visible || picker.isOpen || Boolean(tutorial?.blocking(game)) || Boolean(document.querySelector('dialog[open]:not(#player-modal)'));

function scheduleAi(delay = AI_DELAY) {
  clearTimeout(aiTimer);
  aiTimer = game && !online && !aiStalled && isAiTurn(game) ? setTimeout(runAi, delay) : null; // en línea las IA juegan en el servidor
}

function runAi() {
  aiTimer = null;
  if (!game || !isAiTurn(game)) return;
  if (aiBlocked()) return scheduleAi(AI_RETRY);
  const before = game;
  try {
    const action = chooseAction(game);
    if (action) dispatch(action, { auto: true });
  } catch (error) {
    console.error('La IA no ha podido elegir jugada', error);
  }
  if (game === before) {
    aiStalled = true;
    clearTimeout(aiTimer);
  }
}

/** Zonas del tablero que se pueden pulsar: los solares exteriores en el paso 13 y, en juego, lo que pida el turno. */
function targets() {
  let list;
  if (game.phase !== 'initial-characters') list = boardTargets(game, turnCtx());
  else if (!selectedCard || isWaiting(game)) list = [];
  else {
    list = freeOuterLots(game).map((lot) => ({
      zone: lot, title: `Colocar ${CHARACTERS_BY_ID[selectedCard].name} aquí`, onClick: () => dispatch({ type: 'placeInitial', card: selectedCard, lot }),
    }));
  }
  return tutorial ? tutorial.filterTargets(game, list) : list;
}

/** Cambia lo que el jugador está eligiendo (sin tocar la partida) y redibuja. */
function set(patch) {
  ui = { ...ui, ...patch, error: null };
  render();
}

/** ¿Es la misma "mano" (mismo jugador, misma fase)? Entonces la jugada anterior se puede deshacer. */
const turnKey = (g) => [g.phase, whoseTurn(g), g.turn?.index, g.month, Boolean(g.pending)].join('|');

/** Aplica una acción al motor; si no es válida, lo dice en el panel y deja la partida como estaba. */
function dispatch(action, { auto = false } = {}) {
  if (online) return void dispatchOnline(action);
  const before = game;
  const refusal = !auto && tutorial?.refuse(game, action);
  if (refusal) {
    ui = { ...ui, error: refusal };
    return render();
  }
  let next;
  try {
    next = act(before, action);
  } catch (error) {
    ui = { ...ui, error: error.message };
    return render();
  }
  aiStalled = false;
  history = !auto && turnKey(before) === turnKey(next) ? [...history, before].slice(-MAX_UNDO) : []; // lo que juega la IA no se deshace
  game = next;
  selectedCard = null;
  ui = {};
  persist();
  render();
  eventSummary.show(game, game.log.filter((e) => e.seq > (before.logSeq ?? 0)));
  if (game.phase === 'ended' && before.phase !== 'ended') finalTable.open(game);
}

function undo() {
  if (!history.length) return;
  game = history.at(-1);
  history = history.slice(0, -1);
  ui = {};
  persist();
  render();
}

function newGame(players) {
  endTutorial();
  leaveOnline();
  aiStalled = false;
  game = createGame({ players: players.map(({ boardId, ai }) => ({ boardId, ai })), seed: randomSeed() });
  selectedCard = null;
  ui = {};
  history = [];
  persist();
  render();
}

/** Guarda la partida salvo en el tutorial, que no debe pisar la que hubiera guardada. */
function persist() {
  if (!tutorial && !online) saveGame(game);
}

// --- Partida en línea --------------------------------------------------------------------------
// El servidor guarda la partida y decide qué jugadas valen: aquí solo se pinta lo que manda (la vista pública, sin
// semilla ni mazos) y se le envían las acciones. Si no es tu turno, se pregunta cada poco si ha cambiado.

const POLL_MS = 2500;
let onlineBusy = false;
let pollTimer = null;

/** Adopta la partida que manda el servidor: la vista pública más quién soy y cómo se llama cada jugador. */
function adoptOnline(res) {
  online = { id: res.id, version: res.version, me: res.me, seats: res.seats, status: res.status };
  game = { ...res.view, viewer: res.me };
  game.players = game.players.map((p, i) => ({ ...p, userName: p.ai ? undefined : res.seats[i]?.name }));
}

/** Tras un cambio llegado del servidor: redibuja, cuenta el Evento si lo hubo y abre la tabla final al terminar. */
function showOnlineChange(before) {
  selectedCard = null;
  ui = {};
  render();
  eventSummary.show(game, game.log.filter((e) => e.seq > (before.logSeq ?? 0)));
  if (game.phase === 'ended' && before.phase !== 'ended') finalTable.open(game);
}

async function playOnline(id) {
  try {
    const res = await api('GET', `/games/${id}`);
    endTutorial();
    leaveOnline();
    adoptOnline(res);
    selectedCard = null;
    ui = {};
    history = [];
    cover.hide();
    render();
    pollTimer = setInterval(pollOnline, POLL_MS);
    if (game.phase === 'ended') finalTable.open(game);
  } catch (error) {
    cover.show(Boolean(game));
    toast.textContent = error.message;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 4000);
  }
}

function leaveOnline() {
  clearInterval(pollTimer);
  pollTimer = null;
  online = null;
  document.body.classList.remove('sending');
}

async function pollOnline() {
  if (!online || onlineBusy || document.hidden) return;
  const id = online.id;
  try {
    const res = await api('GET', `/games/${id}?since=${online.version}`);
    if (res.unchanged || !online || online.id !== id || onlineBusy) return;
    const before = game;
    adoptOnline(res);
    showOnlineChange(before);
  } catch {
    // Sin conexión o error del servidor: se vuelve a intentar en el siguiente sondeo.
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnline(); });

/** Manda la acción al servidor y pinta el estado que devuelve (o el motivo del rechazo). */
async function dispatchOnline(action) {
  if (onlineBusy || !online) return;
  const before = game;
  onlineBusy = true;
  document.body.classList.add('sending');
  try {
    adoptOnline(await api('POST', `/games/${online.id}/action`, { action, version: online.version }));
    showOnlineChange(before);
  } catch (error) {
    if (error.data?.game) { // la partida había cambiado: se actualiza y se avisa
      adoptOnline(error.data.game);
      showOnlineChange(before);
      ui = { error: 'La partida había cambiado: revisa la mesa y vuelve a intentarlo.' };
    } else ui = { ...ui, error: error.message };
    render();
  } finally {
    onlineBusy = false;
    document.body.classList.remove('sending');
  }
}

// Jugar en línea queda oculto hasta lanzarlo; el servidor y el cliente siguen en el código.
const ONLINE_ENABLED = false;
const hub = createOnline({
  onPlay: playOnline,
  onClose: () => cover.show(Boolean(game)),
});

// --- Tutorial ----------------------------------------------------------------------------------
// Una partida de tutorial es una partida normal con un guion por encima (src/tutorial). Al salir se vuelve a la partida
// guardada; al terminar el mes se puede seguir jugando con ella.

function startTutorial() {
  endTutorial();
  leaveOnline();
  tutorial = createTutorial({
    coach: document.getElementById('coach'),
    board,
    onChange: render,
    onExit: ({ keep }) => exitTutorial({ keep }),
  });
  aiStalled = false;
  game = createTutorialGame();
  selectedCard = null;
  ui = {};
  history = [];
  render();
}

function endTutorial() {
  tutorial?.close();
  tutorial = null;
}

function exitTutorial({ keep }) {
  endTutorial();
  aiStalled = false;
  selectedCard = null;
  ui = {};
  history = [];
  if (keep) saveGame(game);
  else game = loadGame();
  render();
  if (!keep) cover.show(Boolean(game));
}

btnReroll.addEventListener('click', () => newGame(game.players));

// Portada y tableros de jugador: «Nueva partida» abre el selector; al pulsar Empezar se prepara una partida nueva.
const cover = createCover({ onNew: () => openPicker({ fromCover: true }), onContinue: () => {}, onTutorial: startTutorial, onOnline: ONLINE_ENABLED ? () => hub.open() : undefined });
let pickerFromCover = false;
const picker = createBoardPicker({
  onDone: (players) => { if (players.length >= MIN_PLAYERS) newGame(players); },
  onCancel: () => { if (pickerFromCover) cover.show(Boolean(game)); },
});
function openPicker({ fromCover = false } = {}) {
  pickerFromCover = fromCover;
  picker.open();
}
btnPicker.addEventListener('click', () => openPicker());
document.getElementById('open-menu').addEventListener('click', () => cover.show(Boolean(game)));
window.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') && !tutorial && !online && !e.target.closest?.('#board-picker, #player-modal, #cover, select, input')) openPicker();
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
