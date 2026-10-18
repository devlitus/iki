/**
 * Salir de IKI en el móvil. A pantalla completa (o instalada) no hay barras del navegador y cuesta encontrar cómo
 * cerrar, así que:
 *
 * - El «Atrás» del sistema no abandona la página de golpe: pregunta «¿Salir de IKI?». Un segundo «Atrás», o «Salir»,
 *   sale de verdad. Para eso se deja una entrada de más en el historial, que el navegador solo respeta si se añade
 *   tras un toque del jugador.
 * - La portada (el Menú) tiene un botón «Salir» que hace lo mismo.
 *
 * Salir quita la pantalla completa y el bloqueo del giro, y vuelve atrás en el historial: en la app instalada eso
 * la cierra. Si no hay a dónde volver (pestaña abierta directamente en IKI), la página no puede cerrarse sola y se
 * explica cómo hacerlo. La partida ya se guarda en cada jugada, así que no se pierde nada.
 */
import { exitFullscreen } from './fullscreen.ts';

const touch = matchMedia('(pointer: coarse)');

export function initExit({ button }: { button: HTMLElement }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'exit-dialog';
  dialog.className = 'iki-dialog';
  document.body.append(dialog);

  let guarded = false; // hay una entrada de más en el historial que «Atrás» consume antes de salir
  let leaving = false;

  const arm = () => {
    if (guarded || leaving || !touch.matches) return;
    history.pushState({ ikiGuard: true }, '');
    guarded = true;
  };
  document.addEventListener('pointerup', arm, true);

  const ask = () => {
    dialog.innerHTML = `
      <h2>¿Salir de IKI?</h2>
      <p>Tu partida queda guardada: la encontrarás en «Continuar» cuando vuelvas.</p>
      <footer>
        <button type="button" class="btn" data-exit="stay" autofocus>Seguir jugando</button>
        <button type="button" class="btn exit-leave" data-exit="leave">Salir</button>
      </footer>`;
    if (!dialog.open) dialog.showModal();
  };

  const stuck = () => {
    dialog.innerHTML = `
      <h2>Ya puedes cerrar IKI</h2>
      <p>Se ha quitado la pantalla completa. Cierra la pestaña o la app desde el navegador o el sistema
        (desliza desde el borde inferior para ver sus botones).</p>
      <p class="muted">Tu partida queda guardada.</p>
      <footer><button type="button" class="btn" data-exit="stay" autofocus>Volver al juego</button></footer>`;
    if (!dialog.open) dialog.showModal();
  };

  const leave = () => {
    leaving = true;
    exitFullscreen();
    try { screen.orientation?.unlock?.(); } catch { /* no se había bloqueado */ }
    const steps = guarded ? 2 : 1;
    guarded = false;
    history.go(-steps);
    // Si seguimos aquí, no había página anterior: explicarlo en vez de dejar al jugador sin respuesta.
    setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      leaving = false;
      stuck();
    }, 400);
  };

  addEventListener('popstate', () => {
    if (leaving) return;
    guarded = false;
    if (dialog.open) leave(); // segundo «Atrás» con la pregunta abierta: salir
    else ask();
  });

  dialog.addEventListener('click', (e) => {
    const action = (e.target as Element).closest?.<HTMLElement>('[data-exit]')?.dataset.exit;
    if (action === 'leave') leave();
    else if (action === 'stay' || e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', arm);

  const sync = () => { button.hidden = !touch.matches; };
  button.addEventListener('click', ask);
  touch.addEventListener('change', sync);
  sync();
}
