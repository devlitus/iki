import { currentPicker } from '../game/setup.ts';
import { cardSummary, isWaiting } from './format.ts';
import type { Game } from '../types.ts';

/** Pantallas bajas (móvil en horizontal): el tablero a todo el alto y lo demás en paneles. Igual que en mobile.css. */
const MOBILE = matchMedia('(max-height: 560px)');
/** ¿Está activa la distribución para móvil? */
export const isMobileLayout = () => MOBILE.matches;
const TAP_SLOP = 10; // px que puede moverse el dedo y seguir siendo un toque

/** Carta que se amplía al tocarla: un botón (o una imagen) con `data-zoom`. */
type Zoomable = HTMLButtonElement;


/**
 * Distribución para móvil. Una barra de iconos a la izquierda abre «Mesa» (mazos, fila, edificios y reserva) o
 * «Jugadores» como paneles sobre el tablero, uno cada vez; el panel de turno es una columna a la derecha que se pliega.
 * Al tocar una carta se ve en grande antes de elegirla, porque en táctil no hay ampliación al pasar el ratón.
 */
export function createMobileLayout({ app, side, players, turn }: { app: HTMLElement; side: HTMLElement; players: HTMLElement; turn: HTMLElement }) {
  const rail = document.getElementById('rail')!;
  const btnTurn = rail.querySelector<HTMLElement>('[data-rail="turn"]')!;
  const btnSide = rail.querySelector<HTMLElement>('[data-rail="side"]')!;
  const drawers: Record<string, HTMLElement> = { side, players };
  let collapsed = false;
  let mustPick = false; // el humano tenía que elegir su personaje inicial en el último update
  let mustAct = false; // en juego y le toca decidir al humano
  let revealed: string | null = null; // paso del tutorial cuyo panel ya se abrió

  // El panel de turno vive en la columna izquierda en escritorio y en su propia columna en móvil.
  const home = { parent: turn.parentElement!, next: turn.nextElementSibling };
  const place = () => {
    if (MOBILE.matches) app.append(turn);
    else home.parent.insertBefore(turn, home.next);
    if (!MOBILE.matches) closeDrawer();
  };

  function openDrawer(name: string) {
    app.dataset.drawer = name;
    rail.querySelectorAll<HTMLElement>('[data-rail]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.rail === name)));
    drawers[name].scrollTop = 0;
  }
  function closeDrawer() {
    delete app.dataset.drawer;
    rail.querySelectorAll('[data-rail="side"], [data-rail="players"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  const toggleDrawer = (name: string) => (app.dataset.drawer === name ? closeDrawer() : openDrawer(name));

  function setCollapsed(value: boolean) {
    collapsed = value;
    app.classList.toggle('turn-collapsed', collapsed);
    btnTurn.setAttribute('aria-expanded', String(!collapsed));
    btnTurn.classList.toggle('attn', mustAct && collapsed);
  }

  rail.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-rail]');
    if (!b || !(b.dataset.rail! in drawers || b.dataset.rail === 'turn' || b.dataset.rail === 'menu')) return; // pantalla completa: fullscreen.js
    if (b.dataset.rail === 'turn') { closeDrawer(); setCollapsed(!collapsed); } else if (b.dataset.rail === 'menu') { closeDrawer(); document.getElementById('open-menu')!.click(); } else toggleDrawer(b.dataset.rail!);
  });
  // El velo detrás del panel abierto es un ::after de #app: tocarlo cierra el panel.
  app.addEventListener('click', (e) => { if (e.target === app) closeDrawer(); });
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-open-drawer]');
    if (b) openDrawer(b.dataset.openDrawer!);
    else if ((e.target as Element).closest?.('#toolbar button.btn')) closeDrawer(); // jugadores, menú…: se abren sobre el tablero; el desplegable de fichas especiales, no
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !preview.hidden) closePreview(); });

  // --- Carta en grande ---------------------------------------------------------------------------
  const preview = document.createElement('div');
  preview.id = 'card-preview';
  preview.hidden = true;
  preview.innerHTML = `<figure><img alt=""><figcaption></figcaption>
    <div class="actions"><aside class="card-summary"></aside><button type="button" class="btn primary" data-pv="pick">Elegir</button><button type="button" class="btn" data-pv="close">Cerrar</button></div></figure>`;
  document.body.append(preview);
  const pvImg = preview.querySelector('img')!;
  const pvCaption = preview.querySelector('figcaption')!;
  const pvPick = preview.querySelector<HTMLElement>('[data-pv="pick"]')!;
  const pvSummary = preview.querySelector<HTMLElement>('.card-summary')!;
  let source: Zoomable | null = null; // el botón de la carta ampliada
  let confirmed = false; // el clic que se reenvía al pulsar «Elegir» no debe volver a abrir la ampliación

  function openPreview(el: Zoomable) {
    source = el;
    pvImg.src = el.dataset.zoom!;
    pvCaption.textContent = el.title || el.querySelector('img')?.alt || '';
    pvSummary.innerHTML = cardSummary(el.dataset.zoom!);
    pvSummary.hidden = !pvSummary.innerHTML;
    pvPick.hidden = el.disabled || !el.matches('button');
    pvPick.textContent = el.classList.contains('selected') ? 'Quitar selección' : 'Elegir';
    preview.hidden = false;
  }
  function closePreview() {
    preview.hidden = true;
    source = null;
  }
  preview.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-pv="pick"]') && source?.isConnected) {
      const el = source;
      closePreview();
      if (el.closest('#side, #players')) closeDrawer(); // vuelve el tablero para colocar la carta
      confirmed = true;
      el.click();
      confirmed = false;
    } else if (e.target === preview || (e.target as Element).closest('[data-pv="close"]')) closePreview();
  });

  // Las cartas que se pueden pulsar: el clic se detiene y primero se amplían.
  document.addEventListener('click', (e) => {
    if (!MOBILE.matches || confirmed) return;
    const el = (e.target as Element).closest?.<Zoomable>('#app [data-zoom]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openPreview(el);
  }, true);
  // Las desactivadas no reciben clics, pero sí pointerup: también se pueden ampliar para leerlas.
  let down: { x: number; y: number; el: Zoomable | null | undefined } | null = null;
  document.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, el: (e.target as Element).closest?.<Zoomable>('#app [data-zoom]') }; }, true);
  document.addEventListener('pointerup', (e) => {
    const el = down?.el;
    if (!MOBILE.matches || !el?.disabled || Math.hypot(e.clientX - down!.x, e.clientY - down!.y) > TAP_SLOP) return;
    if (el.contains(e.target as Node)) openPreview(el);
  }, true);

  MOBILE.addEventListener('change', place);
  place();

  return {
    get active() { return MOBILE.matches; },

    /** Después de cada render: avisos de la barra y, al empezar a elegir el personaje inicial, se abre la Mesa. */
    update(game: Game | null, { selectedCard, tutorialFocus = false }: { selectedCard?: string | null; tutorialFocus?: boolean } = {}) {
      if (!preview.hidden && !source?.isConnected) closePreview(); // la carta se redibujó: la ampliación ya no vale
      const playing = Boolean(game) && game.phase !== 'initial-characters';
      btnTurn.hidden = !playing;
      const humanActs = Boolean(game) && !isWaiting(game) && game.phase !== 'ended';
      const picking = Boolean(game) && currentPicker(game) != null && humanActs && !selectedCard;
      const hiring = playing && humanActs && game.turn?.step === 'b1';
      mustAct = playing && humanActs;
      btnTurn.classList.toggle('attn', mustAct && collapsed);
      btnSide.classList.toggle('attn', picking || hiring);
      if (MOBILE.matches && picking && !mustPick && !tutorialFocus) openDrawer('side');
      mustPick = picking;
    },

    /** El tutorial señala algo que está dentro de un panel cerrado: se abre ese panel, una vez por paso (`key`). */
    reveal(key: string) {
      if (!MOBILE.matches || key === revealed) return;
      revealed = key;
      const focus = document.querySelector('#side .tut-focus, #players .tut-focus');
      if (focus) openDrawer(focus.closest('#side') ? 'side' : 'players');
      else if (document.querySelector('#turn .tut-focus')) { closeDrawer(); setCollapsed(false); }
    },

    closeDrawer,
  };
}
