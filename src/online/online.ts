import './online.css';
import { api, ApiError } from './api.js';
import { esc } from '../view/format.js';

/**
 * Diálogo «Jugar en línea»: cuenta (entrar / crear), partidas (las mías, las salas abiertas), sala de espera y ranking.
 * Solo gestiona las pantallas y habla con la API; cuando hay que jugar avisa con `onPlay(id)` y main.js se encarga.
 */

const STATUS = { lobby: 'Sala de espera', playing: 'En curso', ended: 'Terminada', cancelled: 'Cancelada' };
const POLL = { hub: 5000, room: 2000 };

export function createOnline({ onPlay, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'online';
  dialog.className = 'iki-dialog online';
  document.body.append(dialog);

  let s = { screen: 'auth', mode: 'login', user: null, games: null, room: null, ranking: null, error: null, busy: false };
  let timer = null;
  let entering = false;

  const set = (patch) => { s = { ...s, ...patch }; draw(); };
  const fail = (error) => set({ error: error instanceof ApiError ? error.message : 'Algo ha fallado', busy: false });

  // --- Pantallas ---------------------------------------------------------------------------------

  const authScreen = () => `
    <h2>Jugar en línea</h2>
    <p class="muted">Crea una cuenta para jugar con otras personas y entrar en el ranking. Las partidas se guardan en el servidor.</p>
    <div class="tabs" role="tablist">
      <button type="button" class="btn${s.mode === 'login' ? ' on' : ''}" data-do="mode" data-mode="login">Entrar</button>
      <button type="button" class="btn${s.mode === 'register' ? ' on' : ''}" data-do="mode" data-mode="register">Crear cuenta</button>
    </div>
    <form data-form="auth" autocomplete="on">
      <label>Nombre<input name="name" required minlength="3" maxlength="20" autocomplete="username" autofocus></label>
      <label>Contraseña<input name="password" type="password" required minlength="8" maxlength="200" autocomplete="${s.mode === 'login' ? 'current-password' : 'new-password'}"></label>
      <button type="submit" class="btn primary" ${s.busy ? 'disabled' : ''}>${s.mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
    </form>`;

  const seatLine = (seat) => seat.free ? '<li class="free">Libre</li>'
    : `<li>${esc(seat.name)}${seat.ai ? ' <span class="badge">IA</span>' : ''}${seat.host ? ' <span class="badge">anfitrión</span>' : ''}</li>`;

  const gameLine = (g, { join = false } = {}) => `
    <li class="game-row">
      <span class="game-seats">${g.seats.map((x) => (x.free ? '·' : esc(x.name))).join(', ')}</span>
      <span class="badge">${STATUS[g.status]}</span>${g.ranked ? '<span class="badge">clasificatoria</span>' : ''}
      <button type="button" class="btn btn-sm" data-do="${join ? 'join' : 'open'}" data-id="${g.id}">${join ? 'Unirse' : g.status === 'lobby' ? 'Abrir sala' : g.status === 'playing' ? 'Jugar' : 'Ver'}</button>
    </li>`;

  const hubScreen = () => `
    <h2>Hola, ${esc(s.user.name)}</h2>
    <p class="muted">Puntuación ${s.user.rating} · ${s.user.games} partidas · ${s.user.wins} victorias</p>
    <div class="actions">
      <button type="button" class="btn primary" data-do="create" data-size="3" ${s.busy ? 'disabled' : ''}>Nueva partida de 3</button>
      <button type="button" class="btn primary" data-do="create" data-size="4" ${s.busy ? 'disabled' : ''}>Nueva partida de 4</button>
      <button type="button" class="btn" data-do="ranking">Ranking</button>
    </div>
    <h3>Mis partidas</h3>
    <ul class="games">${s.games?.mine.length ? s.games.mine.map((g) => gameLine(g)).join('') : '<li class="muted">Ninguna todavía.</li>'}</ul>
    <h3>Salas abiertas</h3>
    <ul class="games">${s.games?.open.length ? s.games.open.map((g) => gameLine(g, { join: true })).join('') : '<li class="muted">No hay salas con asientos libres.</li>'}</ul>
    <footer><button type="button" class="btn close">Cerrar</button><button type="button" class="btn" data-do="logout">Salir de la cuenta</button></footer>`;

  const roomScreen = () => {
    const r = s.room;
    const full = !r.seats.some((x) => x.free);
    const humans = r.seats.filter((x) => !x.free && !x.ai).length;
    return `
      <h2>Sala de espera</h2>
      <p class="muted">${r.size} jugadores. ${r.isHost ? 'Comparte el nombre de la cuenta: pueden unirse desde «Salas abiertas».' : 'Espera a que el anfitrión empiece.'}
        ${humans === r.size ? 'Todos son personas: la partida será <b>clasificatoria</b>.' : 'Con alguna IA la partida no puntúa en el ranking.'}</p>
      <ol class="seats">${r.seats.map(seatLine).join('')}</ol>
      <div class="actions">
        ${r.isHost ? `
          <button type="button" class="btn" data-do="ai" data-add="true" ${r.seats.some((x) => x.free) ? '' : 'disabled'}>Añadir IA</button>
          <button type="button" class="btn" data-do="ai" data-add="false" ${r.seats.some((x) => x.ai) ? '' : 'disabled'}>Quitar IA</button>
          <button type="button" class="btn primary" data-do="start" ${full && !s.busy ? '' : 'disabled'}>Empezar</button>` : ''}
        <button type="button" class="btn" data-do="leave">Salir de la sala</button>
        <button type="button" class="btn" data-do="hub">Volver</button>
      </div>`;
  };

  const rankingScreen = () => `
    <h2>Ranking</h2>
    <table class="rank-table">
      <thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Partidas</th><th>Victorias</th></tr></thead>
      <tbody>${s.ranking?.length ? s.ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.rating}</td><td>${r.games}</td><td>${r.wins}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Todavía no hay partidas clasificatorias terminadas.</td></tr>'}</tbody>
    </table>
    <footer><button type="button" class="btn" data-do="hub">Volver</button></footer>`;

  function draw() {
    const body = { auth: authScreen, hub: hubScreen, room: roomScreen, ranking: rankingScreen }[s.screen]();
    const keep = dialog.querySelector('form')?.elements.name?.value; // no perder lo escrito al redibujar
    dialog.innerHTML = `${body}${s.error ? `<p class="turn-error" role="alert">${esc(s.error)}</p>` : ''}`;
    const nameInput = dialog.querySelector('form')?.elements.name;
    if (nameInput && keep) nameInput.value = keep;
    if (s.screen === 'auth' && !dialog.querySelector(':focus')) nameInput?.focus();
  }

  // --- Datos -------------------------------------------------------------------------------------

  async function refresh() {
    try {
      if (s.screen === 'hub') set({ games: await api('GET', '/games'), user: (await api('GET', '/me')).user ?? s.user });
      else if (s.screen === 'room') {
        const res = await api('GET', `/games/${s.room.id}?since=${s.room.version}`);
        if (!res.unchanged) await showRoom(res);
      }
    } catch (error) {
      if (error.status === 401) set({ screen: 'auth', user: null });
    }
  }

  function schedule() {
    clearTimeout(timer);
    const every = POLL[s.screen];
    if (dialog.open && every) timer = setTimeout(async () => { await refresh(); schedule(); }, every);
  }

  /** Muestra la sala, o entra a jugar si la partida ya ha empezado. */
  async function showRoom(room) {
    if (room.status === 'playing' || room.status === 'ended') return play(room.id);
    if (room.status === 'cancelled') return set({ screen: 'hub', room: null, error: 'La sala se ha cancelado', games: await api('GET', '/games') });
    set({ screen: 'room', room, error: null });
  }

  function play(id) {
    entering = true;
    dialog.close();
    entering = false;
    onPlay(id);
  }

  async function toHub() {
    set({ screen: 'hub', error: null, room: null, games: s.games, busy: false });
    set({ games: await api('GET', '/games') });
  }

  // --- Acciones ----------------------------------------------------------------------------------

  const ACTIONS = {
    mode: (el) => set({ mode: el.dataset.mode, error: null }),
    hub: () => toHub(),
    ranking: async () => set({ screen: 'ranking', ranking: (await api('GET', '/ranking')).ranking, error: null }),
    logout: async () => { await api('POST', '/logout', {}); set({ screen: 'auth', user: null, games: null, error: null }); },
    create: async (el) => showRoom(await api('POST', '/games', { size: Number(el.dataset.size) })),
    open: async (el) => showRoom(await api('GET', `/games/${el.dataset.id}`)),
    join: async (el) => showRoom(await api('POST', `/games/${el.dataset.id}/join`, {})),
    leave: async () => { await api('POST', `/games/${s.room.id}/leave`, {}); await toHub(); },
    ai: async (el) => showRoom(await api('POST', `/games/${s.room.id}/ai`, { add: el.dataset.add === 'true' })),
    start: async () => showRoom(await api('POST', `/games/${s.room.id}/start`, {})),
  };

  dialog.addEventListener('click', async (e) => {
    if (e.target === dialog || e.target.closest('.close')) return dialog.close();
    const el = e.target.closest('[data-do]');
    if (!el || s.busy) return;
    s = { ...s, busy: true, error: null };
    try {
      await ACTIONS[el.dataset.do](el);
    } catch (error) {
      fail(error);
    }
    set({ busy: false }); // redibuja con los botones otra vez activos
    schedule();
  });

  dialog.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form !== 'auth' || s.busy) return;
    const credentials = { name: form.elements.name.value, password: form.elements.password.value }; // antes de redibujar
    set({ busy: true, error: null });
    try {
      const { user } = await api('POST', s.mode === 'login' ? '/login' : '/register', credentials);
      set({ user, screen: 'hub', busy: false });
      await toHub();
      schedule();
    } catch (error) {
      fail(error);
    }
  });

  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    if (!entering) onClose();
  });

  return {
    async open() {
      dialog.showModal();
      set({ error: null, busy: false });
      try {
        const { user } = await api('GET', '/me');
        if (user) { set({ user, screen: 'hub' }); await toHub(); } else set({ screen: 'auth', user: null });
      } catch (error) {
        set({ screen: 'auth', user: null, error: error.message });
      }
      schedule();
    },
  };
}
