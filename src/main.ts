import { createBoard } from './board.ts';
import { createZonesOverlay } from './zonesOverlay.ts';
import { ZONES_BY_ID } from './data/zones.ts';
import './cards/card.css';
import { createBoardPicker } from './players/boardPicker.ts';
import './players/players.css';
import { createGame, freeOuterLots, MIN_PLAYERS, GAME_VERSION } from './game/setup.ts';
import { act, whoseTurn } from './game/engine.ts';
import { randomSeed } from './game/random.ts';
import { chooseAction, isAiTurn } from './ai/player.ts';
import { renderDecks, renderSupply, renderPlayers, renderSpecialsInfo } from './view/table.ts';
import { renderBoardPieces } from './view/boardPieces.ts';
import { renderTurnPanel, bindTurnPanel, boardTargets, hireableCards } from './view/turnPanel.ts';
import { createCover } from './view/cover.ts';
import { createEventSummary, createFinalTable, createLogDialog, initZoom } from './view/dialogs.ts';
import { initTooltips } from './view/tooltip.ts';
import { createPlayerModal } from './view/playerModal.ts';
import { createDiceRoll } from './view/diceRoll.ts';
import './view/diceRoll.css';
import { createMobileLayout } from './view/mobile.ts';
import { initFullscreen } from './view/fullscreen.ts';
import { initExit } from './view/exit.ts';
import { createTutorial } from './tutorial/tutorial.ts';
import { openIntro } from './tutorial/intro.ts';
import { createTutorialGame } from './tutorial/game.ts';
import { createOnline } from './online/online.ts';
import { api, type ApiError } from './online/api.ts';
import { isWaiting } from './view/format.ts';
import { CHARACTERS_BY_ID } from './data/characters.ts';
import './view/table.css';
import './view/turn.css';
import './view/mobile.css';
import type { Ui } from './view/turnPanel.ts';
import type { PickedPlayer } from './players/boardPicker.ts';
import type { Action, Game, Target } from './types.ts';

const board = await createBoard({
  viewport: document.getElementById('viewport')!,
  board: document.getElementById('board')!,
  image: document.getElementById('board-image') as HTMLImageElement,
  pieces: document.getElementById('pieces')!,
});

// Herramienta de desarrollo: Alt + clic marca un punto y muestra/copia sus coordenadas (u, v),
// para ir mapeando las casillas del tablero.
const toast = document.getElementById('toast')!;
const marker = document.createElement('div');
marker.className = 'coord-marker';

document.getElementById('viewport')!.addEventListener('click', (e) => {
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
const zonesOverlay = createZonesOverlay(document.getElementById('board')!);
window.addEventListener('keydown', (e) => {
  if (e.key === 'z' || e.key === 'Z') zonesOverlay.toggle();
});

// --- Partida ---------------------------------------------------------------------------------
const GAME_KEY = 'iki.game';
const MAX_UNDO = 40;
let game: Game | null = loadGame();
let selectedCard: string | null = null; // paso 13: carta inicial elegida, a la espera del solar
let ui: Ui = {}; // lo que el jugador va eligiendo en su turno antes de confirmar (ver view/turnPanel.js)
let history: Game[] = []; // estados anteriores del turno en curso, para deshacer
let tutorial: ReturnType<typeof createTutorial> | null = null; // el tutorial en marcha: guía el turno del humano y no toca la partida guardada
let online: OnlineGame | null = null; // partida alojada en el servidor ({ id, version, me, seats, status }): allí se validan las jugadas y se juegan las IA

const app = document.getElementById('app')!;
const turnEl = document.getElementById('turn')!;
const btnPicker = document.getElementById('open-picker')!;
const specialsInfo = document.getElementById('specials-info')!;
renderSpecialsInfo(specialsInfo);
const playerModal = createPlayerModal();
const diceRoll = createDiceRoll();
const mobile = createMobileLayout({ app, side: document.getElementById('side')!, players: document.getElementById('players')!, turn: turnEl });
/** Nagaya cuya loseta de Incendio sigue boca arriba en el tablero mientras se lee el resumen del incendio. */
let fireTileShown: string | null = null;
const eventSummary = createEventSummary({ onClose: () => { if (fireTileShown) { fireTileShown = null; render(); } } });
const finalTable = createFinalTable({ onNewGame: () => openPicker() });
const logDialog = createLogDialog();
initZoom();
initTooltips();

/** Todo lo que el panel de turno necesita para pintar y para actuar. */
const turnCtx = () => ({ game: game!, ui, set, dispatch, undo, canUndo: history.length > 0, openFinal: () => finalTable.open(game!), openLog: () => logDialog.open(game!) });
bindTurnPanel(turnEl, turnCtx);

/** Deja la mesa vacía, como antes de empezar ninguna partida. */
function clearTable() {
  app.classList.remove('playing');
  mobile.update(null);
  turnEl.hidden = true;
  btnPicker.hidden = Boolean(tutorial) || Boolean(online);
  specialsInfo.hidden = true;
  ['decks', 'supply', 'players'].forEach((id) => document.getElementById(id)!.replaceChildren());
  board.pieces.replaceChildren();
}

function render() {
  if (!game) return clearTable();
  const playing = game.phase !== 'initial-characters';
  app.classList.toggle('playing', playing);
  turnEl.hidden = !playing;
  // Con la partida ya repartida no se cambia de jugadores: en su sitio, la ayuda de las fichas especiales.
  btnPicker.hidden = true;
  specialsInfo.hidden = false;
  if (playing) renderTurnPanel(turnEl, game, turnCtx());

  renderDecks(document.getElementById('decks')!, game, {
    selectedCard, onSelectCard: (id) => { selectedCard = id; render(); },
    hireable: hireableCards(game), hiring: ui.hire, onSelectHire: (card) => set({ hire: card, building: null }),
  });
  renderSupply(document.getElementById('supply')!, game);
  renderPlayers(document.getElementById('players')!, game, { onOpenBoard: (i) => playerModal.open(game!, i) });
  playerModal.update(game);
  const fireNagaya = game.event?.kind === 'fire' ? game.event.nagaya : fireTileShown;
  renderBoardPieces(board, game, { targets: targets(), fireNagaya });
  tutorial?.update(game);
  if (tutorial) mobile.reveal(document.getElementById('coach')!.textContent!);
  mobile.update(game, { selectedCard, tutorialFocus: Boolean(tutorial) });
  scheduleAi();
}

// --- Jugadores de IA ---------------------------------------------------------------------------
// Cuando le toca a una IA, tras una pausa (para que se vea lo que hace) elige y juega su acción. Espera mientras haya
// un diálogo abierto (resumen del Evento, tabla final), la portada o el selector de tableros.
const AI_DELAY = 700;
const AI_RETRY = 400;
let aiTimer: ReturnType<typeof setTimeout> | null = null;
let aiStalled = false; // la IA falló: no reintenta hasta que la partida cambie por otro lado

const aiBlocked = () => cover.visible || picker.isOpen || diceRoll.isOpen || Boolean(tutorial?.blocking(game!)) || Boolean(document.querySelector('dialog[open]:not(#player-modal)'));

function scheduleAi(delay = AI_DELAY) {
  clearTimeout(aiTimer as ReturnType<typeof setTimeout>);
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
    clearTimeout(aiTimer as unknown as number); // dispatch() puede haber programado otro turno
  }
}

/** Zonas del tablero que se pueden pulsar: los solares exteriores en el paso 13 y, en juego, lo que pida el turno. */
function targets(): Target[] {
  let list: Target[];
  if (game!.phase !== 'initial-characters') list = boardTargets(game!, turnCtx());
  else if (!selectedCard || isWaiting(game!)) list = [];
  else {
    list = freeOuterLots(game!).map((lot) => ({
      zone: lot, title: `Colocar ${CHARACTERS_BY_ID[selectedCard!].name} aquí`, onClick: () => dispatch({ type: 'placeInitial', card: selectedCard!, lot }),
    }));
  }
  return tutorial ? tutorial.filterTargets(game!, list) : list;
}

/** Cambia lo que el jugador está eligiendo (sin tocar la partida) y redibuja. */
function set(patch: Partial<Ui>) {
  ui = { ...ui, ...patch, error: null };
  render();
}

/** ¿Es la misma "mano" (mismo jugador, misma fase)? Entonces la jugada anterior se puede deshacer. */
const turnKey = (g: Game) => [g.phase, whoseTurn(g), g.turn?.index, g.month, Boolean(g.pending)].join('|');

/** Aplica una acción al motor; si no es válida, lo dice en el panel y deja la partida como estaba. */
function dispatch(action: Action, { auto = false } = {}) {
  if (online) return void dispatchOnline(action);
  const before = game!;
  const refusal = !auto && tutorial?.refuse(game!, action);
  if (refusal) {
    ui = { ...ui, error: refusal };
    return render();
  }
  let next: Game;
  try {
    next = act(before, action);
  } catch (error) {
    ui = { ...ui, error: (error as Error).message };
    return render();
  }
  aiStalled = false;
  history = !auto && turnKey(before) === turnKey(next) ? [...history, before].slice(-MAX_UNDO) : []; // lo que juega la IA no se deshace
  game = next;
  selectedCard = null;
  ui = {};
  persist();
  render();
  showEvent(before);
  if (game.phase === 'ended' && before.phase !== 'ended') finalTable.open(game);
}

/** Cuenta el Evento ocurrido desde `before`; si fue un Incendio, su loseta queda en el Nagaya hasta cerrar el resumen. */
function showEvent(before: Game) {
  const nagaya = eventSummary.show(game!, game!.log.filter((e) => e.seq > (before.logSeq ?? 0)));
  if (nagaya) {
    fireTileShown = nagaya;
    render();
  }
}

function undo() {
  if (!history.length) return;
  game = history.at(-1)!;
  history = history.slice(0, -1);
  ui = {};
  persist();
  render();
}

function newGame(players: PickedPlayer[]) {
  endTutorial();
  leaveOnline();
  aiStalled = false;
  game = createGame({ players: players.map(({ boardId, ai }) => ({ boardId, ai })), seed: randomSeed() });
  // Nombres del selector: los de las personas, si los escribieron, y los de la IA.
  game.players = game.players.map((p, i) => ({ ...p, userName: players[i].name || undefined }));
  selectedCard = null;
  ui = {};
  history = [];
  persist();
  render();
  // Solo en una partida nueva: se enseña cómo salió el jugador inicial; la IA espera a que se cierre.
  diceRoll.show(game).then(() => scheduleAi());
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
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Partida en línea: lo que manda el servidor además de la vista (ver server/games.js). */
type OnlineGame = { id: string; version: number; me: number; seats: { name?: string }[]; status: string };

/** Adopta la partida que manda el servidor: la vista pública más quién soy y cómo se llama cada jugador. */
function adoptOnline(res: OnlineGame & { view: Game }) {
  online = { id: res.id, version: res.version, me: res.me, seats: res.seats, status: res.status };
  game = { ...res.view, viewer: res.me };
  game.players = game.players.map((p, i) => ({ ...p, userName: p.ai ? undefined : res.seats[i]?.name }));
}

/** Tras un cambio llegado del servidor: redibuja, cuenta el Evento si lo hubo y abre la tabla final al terminar. */
function showOnlineChange(before: Game | null) {
  selectedCard = null;
  ui = {};
  render();
  showEvent(before!);
  if (game!.phase === 'ended' && before!.phase !== 'ended') finalTable.open(game!);
}

async function playOnline(id: string) {
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
    if (game!.phase === 'ended') finalTable.open(game!);
  } catch (error) {
    cover.show(Boolean(game));
    toast.textContent = (error as Error).message;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 4000);
  }
}

function leaveOnline() {
  clearInterval(pollTimer as ReturnType<typeof setInterval>);
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
async function dispatchOnline(action: Action) {
  if (onlineBusy || !online) return;
  const before = game;
  onlineBusy = true;
  document.body.classList.add('sending');
  try {
    adoptOnline(await api('POST', `/games/${online.id}/action`, { action, version: online.version }));
    showOnlineChange(before);
  } catch (error) {
    if ((error as ApiError).data?.game) { // la partida había cambiado: se actualiza y se avisa
      adoptOnline((error as ApiError).data.game);
      showOnlineChange(before);
      ui = { error: 'La partida había cambiado: revisa la mesa y vuelve a intentarlo.' };
    } else ui = { ...ui, error: (error as Error).message };
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
    coach: document.getElementById('coach')!,
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

function exitTutorial({ keep }: { keep: boolean }) {
  endTutorial();
  aiStalled = false;
  selectedCard = null;
  ui = {};
  history = [];
  if (keep) saveGame(game!);
  else game = loadGame();
  render();
  if (!keep) cover.show(Boolean(game));
}

// Portada y tableros de jugador: «Nueva partida» abre el selector; al pulsar Empezar se prepara una partida nueva.
const cover = createCover({ onNew: () => openIntro({ tutorial: false, onClose: () => openPicker({ fromCover: true }) }), onContinue: () => {}, onTutorial: startTutorial, onOnline: ONLINE_ENABLED ? () => hub.open() : undefined });
initFullscreen({ button: document.querySelector<HTMLButtonElement>('[data-rail="fullscreen"]')!, tip: document.querySelector<HTMLElement>('.cover-install')! });
initExit({ button: cover.exitButton });
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
document.getElementById('open-menu')!.addEventListener('click', () => cover.show(Boolean(game)));
window.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') && !btnPicker.hidden && !(e.target as Element).closest?.('#board-picker, #player-modal, #cover, select, input')) openPicker();
});
if (game) render();
cover.show(Boolean(game));

function loadGame(): Game | null {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_KEY) ?? 'null');
    return saved?.version === GAME_VERSION ? saved : null;
  } catch {
    return null;
  }
}

function saveGame(state: Game | null) {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(state));
  } catch {
    // Sin almacenamiento: la partida dura lo que la pestaña.
  }
}

// Expuesto para depurar desde la consola.
window.iki = { board, zones: ZONES_BY_ID, picker, dispatch, get game() { return game; } };
