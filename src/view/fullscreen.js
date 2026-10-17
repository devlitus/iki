/**
 * Pantalla completa en el móvil, para que las barras del navegador no se coman la mesa.
 *
 * - Android (Chrome, Firefox, Samsung): Fullscreen API. Se entra sola al pulsar un botón de la portada (el navegador
 *   solo la concede tras un toque) y se puede alternar con el botón de la barra; además se bloquea el giro en horizontal.
 * - iPhone: Safari no deja poner una página a pantalla completa. Solo queda instalarla («Añadir a pantalla de inicio»):
 *   el manifiesto (public/manifest.webmanifest) y las etiquetas de index.html la abren entonces sin barras.
 */

const root = document.documentElement;
const touch = matchMedia('(pointer: coarse)');
const installed = matchMedia('(display-mode: fullscreen), (display-mode: standalone)');

export const canFullscreen = Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);
const isFullscreen = () => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
const isInstalled = () => installed.matches || navigator.standalone === true;

export async function enterFullscreen() {
  if (!canFullscreen || isFullscreen()) return;
  try {
    await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
    await screen.orientation?.lock?.('landscape');
  } catch {
    // El navegador lo ha rechazado (sin toque previo, o no deja bloquear el giro): se sigue jugando con barras.
  }
}

function exitFullscreen() {
  (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document).catch?.(() => {});
}

/**
 * @param {{ button: HTMLButtonElement, tip: HTMLElement }} o
 *   button: alterna la pantalla completa (se oculta si no hay Fullscreen API o ya está instalada).
 *   tip:    consejo de la portada para instalarla, solo en móviles sin Fullscreen API (iPhone).
 */
export function initFullscreen({ button, tip }) {
  const sync = () => {
    button.hidden = !canFullscreen || isInstalled();
    button.setAttribute('aria-pressed', String(isFullscreen()));
    button.querySelector('span').textContent = isFullscreen() ? 'Salir' : 'Pantalla';
    tip.hidden = canFullscreen || isInstalled() || !touch.matches;
  };
  button.addEventListener('click', () => (isFullscreen() ? exitFullscreen() : enterFullscreen()));
  // Cualquier botón de la portada es un toque del jugador: en el móvil se aprovecha para entrar en pantalla completa.
  document.addEventListener('click', (e) => {
    if (touch.matches && !isInstalled() && e.target.closest?.('.cover-btn')) enterFullscreen();
  }, true);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  touch.addEventListener('change', sync);
  sync();
}
