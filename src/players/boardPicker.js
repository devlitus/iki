import { PLAYER_BOARDS, PLAYER_BOARDS_BY_ID } from '../data/playerBoards.ts';
import { MIN_PLAYERS, MAX_PLAYERS } from '../game/setup.js';
import { esc } from '../view/format.js';

const STORAGE_KEY = 'iki.playerBoards';
const NAME_MAX = 16;

/** Nombres de la IA, de la Edo de los artesanos: a cada asiento de IA le toca uno al azar, sin repetir. */
export const AI_NAMES = ['Hanzō', 'Kichibei', 'Otsuru', 'Sakichi', 'Okiku', 'Genpachi', 'Omitsu', 'Tōbei', 'Osen', 'Jirokichi'];

/**
 * Selector de tableros de jugador: por turnos, cada jugador pulsa el color que quiere. Dos columnas: a la izquierda los
 * colores (los elegidos quedan bloqueados con el nombre de su jugador) y a la derecha, por orden de elección, quién
 * juega cada asiento: una persona, que escribe su nombre, o la IA, que recibe uno de `AI_NAMES` al azar (se puede
 * sortear otro). Con 3-4 jugadores se puede empezar (falta el lado de 2 jugadores del tablero). La elección se guarda
 * en localStorage.
 *
 * `onDone(players)` recibe, al pulsar Empezar, la lista `[{ player: 1, boardId: 'red', ai: false, name: 'Ana' }, ...]`
 * en orden de elección, que es también el orden de los asientos alrededor de la mesa (sentido horario). `name` puede
 * venir vacío si la persona no escribió nada.
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
      <p class="label picker-col picker-col-boards">Color</p>
      <div class="picker-boards"></div>
      <p class="label picker-col picker-col-seats">Jugadores</p>
      <div class="picker-seats" aria-label="Quién juega cada asiento"></div>
      <footer class="picker-actions">
        <button type="button" class="picker-undo">Deshacer</button>
        <button type="button" class="picker-reset">Reiniciar</button>
        <button type="button" class="picker-done">Empezar</button>
      </footer>
    </div>`;
  document.body.append(overlay);

  const title = overlay.querySelector('#picker-title');
  const list = overlay.querySelector('.picker-boards');
  const seats = overlay.querySelector('.picker-seats');
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
      <span class="picker-name">${board.name}</span>
      <span class="picker-owner"></span>`;
    opt.addEventListener('click', () => {
      if (players.length >= MAX_PLAYERS || ownerOf(board.id)) return;
      players = [...players, { player: players.length + 1, boardId: board.id, ai: false, name: '' }];
      update();
      seats.querySelector(`[data-seat="${players.length}"] input`)?.focus();
    });
    list.append(opt);
  }

  const seatOf = (el) => Number(el.closest('[data-seat]')?.dataset.seat);
  const edit = (seat, change) => (players = players.map((p) => (p.player === seat ? { ...p, ...change } : p)));

  seats.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const seat = seatOf(btn);
    if (btn.getAttribute('aria-pressed') === 'true') return; // ya era así
    // Al pasar a IA, un nombre de la lista; al volver a humano, el campo vacío para escribir el suyo.
    if (btn.dataset.ai) edit(seat, btn.dataset.ai === 'true' ? { ai: true, name: freeAiName(seat) } : { ai: false, name: '' });
    else if (btn.classList.contains('picker-reroll')) edit(seat, { name: freeAiName(seat) });
    else return;
    update();
    if (btn.dataset.ai === 'false') seats.querySelector(`[data-seat="${seat}"] input`)?.focus();
  });
  // Se escribe sin redibujar la fila, para no perder el cursor.
  seats.addEventListener('input', (e) => {
    edit(seatOf(e.target), { name: e.target.value });
    refreshOwners();
    save(players);
  });
  seats.addEventListener('change', (e) => {
    edit(seatOf(e.target), { name: e.target.value.trim() });
    e.target.value = e.target.value.trim();
    save(players);
  });
  seats.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });
  btnUndo.addEventListener('click', () => { players = players.slice(0, -1); update(); });
  btnReset.addEventListener('click', () => { players = []; update(); });
  btnDone.addEventListener('click', () => {
    players = players.map((p) => ({ ...p, name: p.name.trim() }));
    save(players);
    close();
    onDone?.(players);
  });
  overlay.querySelector('.picker-close').addEventListener('click', cancel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  function ownerOf(boardId) {
    return players.find((p) => p.boardId === boardId);
  }

  /** Un nombre de IA que no lleve ya otro asiento (ni el que tenía este, para que sortear cambie algo). */
  function freeAiName(seat) {
    const used = new Set(players.filter((p) => p.ai).map((p) => p.name));
    const free = AI_NAMES.filter((n) => !used.has(n));
    return free[Math.floor(Math.random() * free.length)] ?? AI_NAMES[seat - 1];
  }

  function refreshOwners() {
    for (const opt of list.children) {
      const owner = ownerOf(opt.dataset.id);
      opt.querySelector('.picker-owner').textContent = owner
        ? `${owner.name.trim() || `Jugador ${owner.player}`}${owner.ai ? ' · IA' : ''}` : '';
    }
  }

  function update() {
    const full = players.length >= MAX_PLAYERS;
    title.textContent = full
      ? 'Todos los tableros elegidos'
      : `Jugador ${players.length + 1}: elige tu color`;
    for (const opt of list.children) {
      const owner = ownerOf(opt.dataset.id);
      opt.classList.toggle('taken', Boolean(owner));
      opt.disabled = Boolean(owner) || full;
    }
    refreshOwners();
    seats.innerHTML = players.map((p) => {
      const board = PLAYER_BOARDS_BY_ID[p.boardId];
      const name = p.ai
        ? `<span class="picker-ai-name">${esc(p.name)}</span>
           <button type="button" class="picker-reroll" title="Sortear otro nombre" aria-label="Sortear otro nombre para la IA">⚄</button>`
        : `<input type="text" maxlength="${NAME_MAX}" value="${esc(p.name)}" placeholder="Jugador ${p.player}"
             aria-label="Nombre del jugador ${p.player} (${board.name})" autocomplete="off" spellcheck="false">`;
      return `
        <div class="picker-seat${p.ai ? ' ai' : ''}" data-seat="${p.player}" style="--player-color:${board.color}">
          <span class="picker-seat-color" title="${board.name}">${p.player}</span>
          <div class="picker-kind" role="group" aria-label="Quién juega ${board.name}">
            <button type="button" data-ai="false" aria-pressed="${!p.ai}">Humano</button>
            <button type="button" data-ai="true" aria-pressed="${p.ai}">IA</button>
          </div>
          <div class="picker-player-name">${name}</div>
        </div>`;
    }).join('');
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
  return { open, close, get players() { return players; }, get isOpen() { return !overlay.hidden; } };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    const valid = Array.isArray(saved) && saved.every((p, i) => p.player === i + 1 && PLAYER_BOARDS_BY_ID[p.boardId]);
    const unique = new Set(saved.map((p) => p.boardId)).size === saved.length;
    if (!valid || !unique || saved.length > MAX_PLAYERS) return [];
    // Las elecciones guardadas antes de que hubiera nombres: la IA recibe el de la lista que le toca por asiento.
    return saved.map((p) => {
      const ai = p.ai === true;
      const name = typeof p.name === 'string' ? p.name.slice(0, NAME_MAX) : '';
      return { player: p.player, boardId: p.boardId, ai, name: ai && !name ? AI_NAMES[p.player - 1] : name };
    });
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
