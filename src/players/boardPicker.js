import { PLAYER_BOARDS, PLAYER_BOARDS_BY_ID } from '../data/playerBoards.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../game/setup.js';

const STORAGE_KEY = 'iki.playerBoards';

/**
 * Selector de tableros de jugador: por turnos, cada jugador pulsa el tablero (color) que quiere.
 * Los ya elegidos quedan bloqueados con el nombre de su jugador. Con 3-4 jugadores se puede empezar
 * (falta el lado de 2 jugadores del tablero). La elección se guarda en localStorage.
 *
 * `onDone(players)` recibe, al pulsar Empezar, la lista `[{ player: 1, boardId: 'red' }, ...]` en orden de
 * elección, que es también el orden de los asientos alrededor de la mesa (sentido horario).
 */
export function createBoardPicker({ onDone, onCancel } = {}) {
  let players = load();

  const overlay = document.createElement('div');
  overlay.id = 'board-picker';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="picker-panel" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <header>
        <h2 id="picker-title"></h2>
        <button type="button" class="picker-close" aria-label="Cerrar">×</button>
      </header>
      <div class="picker-boards"></div>
      <footer>
        <button type="button" class="picker-undo">Deshacer</button>
        <button type="button" class="picker-reset">Reiniciar</button>
        <button type="button" class="picker-done">Empezar</button>
      </footer>
    </div>`;
  document.body.append(overlay);

  const title = overlay.querySelector('#picker-title');
  const list = overlay.querySelector('.picker-boards');
  const btnUndo = overlay.querySelector('.picker-undo');
  const btnReset = overlay.querySelector('.picker-reset');
  const btnDone = overlay.querySelector('.picker-done');

  for (const board of PLAYER_BOARDS) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'picker-board';
    opt.dataset.id = board.id;
    opt.style.setProperty('--player-color', board.color);
    opt.innerHTML = `
      <img src="${board.image}" alt="Tablero ${board.name}" draggable="false">
      <span class="picker-name">${board.name}</span>
      <span class="picker-owner"></span>`;
    opt.addEventListener('click', () => {
      if (players.length >= MAX_PLAYERS || ownerOf(board.id)) return;
      players = [...players, { player: players.length + 1, boardId: board.id }];
      update();
    });
    list.append(opt);
  }

  btnUndo.addEventListener('click', () => { players = players.slice(0, -1); update(); });
  btnReset.addEventListener('click', () => { players = []; update(); });
  btnDone.addEventListener('click', () => { close(); onDone?.(players); });
  overlay.querySelector('.picker-close').addEventListener('click', cancel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  function ownerOf(boardId) {
    return players.find((p) => p.boardId === boardId);
  }

  function update() {
    const full = players.length >= MAX_PLAYERS;
    title.textContent = full
      ? 'Todos los tableros elegidos'
      : `Jugador ${players.length + 1}: elige tu tablero`;
    for (const opt of list.children) {
      const owner = ownerOf(opt.dataset.id);
      opt.classList.toggle('taken', Boolean(owner));
      opt.disabled = Boolean(owner) || full;
      opt.querySelector('.picker-owner').textContent = owner ? `Jugador ${owner.player}` : '';
    }
    btnUndo.disabled = players.length === 0;
    btnReset.disabled = players.length === 0;
    btnDone.disabled = players.length < MIN_PLAYERS;
    save(players);
  }

  function open() {
    overlay.hidden = false;
    overlay.querySelector('.picker-board:not(:disabled), .picker-done')?.focus();
  }

  function close() {
    overlay.hidden = true;
  }

  /** Cierra sin empezar partida. */
  function cancel() {
    close();
    onCancel?.();
  }

  update();
  return { open, close, get players() { return players; } };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    const valid = Array.isArray(saved) && saved.every((p, i) => p.player === i + 1 && PLAYER_BOARDS_BY_ID[p.boardId]);
    const unique = new Set(saved.map((p) => p.boardId)).size === saved.length;
    return valid && unique && saved.length <= MAX_PLAYERS ? saved : [];
  } catch {
    return [];
  }
}

function save(players) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  } catch {
    // Sin almacenamiento (modo privado, etc.): la elección dura lo que la pestaña.
  }
}
