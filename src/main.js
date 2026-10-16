import { createBoard } from './board.js';
import { createZonesOverlay } from './zonesOverlay.js';
import { ZONES_BY_ID } from './data/zones.js';
import './cards/card.css';
import { createBoardPicker } from './players/boardPicker.js';
import './players/players.css';
import { createGame, placeInitialCard, MIN_PLAYERS, GAME_VERSION } from './game/setup.js';
import { randomSeed } from './game/random.js';
import { renderDecks, renderSupply, renderPlayers, createStepsDrawer } from './view/table.js';
import { renderBoardPieces } from './view/boardPieces.js';
import { createPlayerModal } from './view/playerModal.js';
import './view/table.css';

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
let game = loadGame();
let selectedCard = null;

const steps = createStepsDrawer({
  drawer: document.getElementById('steps'),
  toggle: document.getElementById('open-steps'),
  root: document.getElementById('app'),
});
const btnReroll = document.getElementById('reroll');
const playerModal = createPlayerModal();

function render() {
  if (!game) return;
  renderDecks(document.getElementById('decks'), game, { selectedCard, onSelectCard: (id) => { selectedCard = id; render(); } });
  renderSupply(document.getElementById('supply'), game);
  renderPlayers(document.getElementById('players'), game, { onOpenBoard: (i) => playerModal.open(game, i) });
  playerModal.update(game);
  renderBoardPieces(board, game, { selectedCard, onPlace });
  btnReroll.disabled = Object.keys(game.lots).length > 0;
  steps.refresh();
}

function onPlace(lotId) {
  if (!selectedCard) return;
  game = placeInitialCard(game, selectedCard, lotId);
  selectedCard = null;
  saveGame(game);
  render();
}

function newGame(players) {
  game = createGame({ players: players.map(({ boardId }) => ({ boardId })), seed: randomSeed() });
  selectedCard = null;
  saveGame(game);
  render();
}

btnReroll.addEventListener('click', () => newGame(game.players));

// Tableros de jugador: la tecla J abre el selector; al pulsar Empezar se prepara una partida nueva.
const picker = createBoardPicker({ onDone: (players) => { if (players.length >= MIN_PLAYERS) newGame(players); } });
const openPicker = () => picker.open();
document.getElementById('open-picker').addEventListener('click', openPicker);
window.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') && !e.target.closest?.('#board-picker, #player-modal')) openPicker();
});
if (game) render();
else if (picker.players.length >= MIN_PLAYERS) newGame(picker.players);
else openPicker();

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
window.iki = { board, zones: ZONES_BY_ID, picker, get game() { return game; } };
