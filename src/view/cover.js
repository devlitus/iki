import './cover.css';
import { createPetals } from './coverPetals.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Portada: la caja del juego con «Nueva partida» y, si hay una guardada, «Continuar». Se muestra al entrar y se
 * puede volver a ella desde el menú. `onNew`, `onContinue`, `onTutorial` y `onOnline` los decide quien la crea; la portada solo se oculta.
 * Sin `onOnline` no se ofrece jugar en línea.
 */
export function createCover({ onNew, onContinue, onTutorial, onOnline }) {
  const el = document.createElement('div');
  el.id = 'cover';
  el.innerHTML = `
    <canvas class="cover-petals" aria-hidden="true"></canvas>
    <div class="cover-stage">
      <div class="cover-box">
        <img class="cover-art" src="/cover.webp" alt="IKI, el juego de los artesanos de Edo" draggable="false">
        <span class="cover-sun" aria-hidden="true"></span>
        <span class="cover-sheen" aria-hidden="true"></span>
      </div>
    </div>
    <nav class="cover-menu" aria-label="Menú principal">
      <span class="cover-seal" aria-hidden="true">粋</span>
      <button type="button" class="btn cover-btn cover-continue">Continuar</button>
      <button type="button" class="btn cover-btn cover-new">Nueva partida</button>
      <button type="button" class="btn cover-btn cover-online" hidden>Jugar en línea</button>
      <button type="button" class="btn cover-btn cover-tutorial">Aprender a jugar</button>
      <button type="button" class="btn cover-btn cover-exit" hidden>Salir</button>
      <p class="muted"><span class="cover-players">3-4 jugadores en la misma pantalla</span></p>
      <p class="muted cover-install" hidden>Para jugar sin las barras del navegador: <b>Compartir → Añadir a pantalla de inicio</b>
        y abre IKI desde su icono.</p>
    </nav>`;
  document.body.append(el);

  const btnContinue = el.querySelector('.cover-continue');
  const petals = createPetals(el.querySelector('.cover-petals'));
  const box = el.querySelector('.cover-box');

  // La caja se inclina hacia el puntero y el brillo del barniz lo sigue.
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reducedMotion.matches) return;
    const r = box.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    box.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    box.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
    box.style.setProperty('--gx', `${((x + 1) * 50).toFixed(1)}%`);
    box.style.setProperty('--gy', `${((y + 1) * 50).toFixed(1)}%`);
  });
  el.addEventListener('pointerleave', () => {
    for (const v of ['--rx', '--ry', '--gx', '--gy']) box.style.removeProperty(v);
  });

  const hide = () => { el.hidden = true; petals.stop(); };
  el.querySelector('.cover-new').addEventListener('click', () => { hide(); onNew(); });
  if (onOnline) {
    const btnOnline = el.querySelector('.cover-online');
    btnOnline.hidden = false;
    btnOnline.addEventListener('click', () => { hide(); onOnline(); });
    el.querySelector('.cover-players').textContent += ' o en línea';
  }
  el.querySelector('.cover-tutorial').addEventListener('click', () => { hide(); onTutorial(); });
  btnContinue.addEventListener('click', () => { hide(); onContinue(); });

  return {
    /** Muestra la portada; «Continuar» solo si `canContinue`. */
    show(canContinue) {
      btnContinue.hidden = !canContinue;
      // Reinicia la entrada (la caja cae sobre la mesa, el sello se estampa) cada vez que se vuelve a la portada.
      el.classList.remove('cover-enter');
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('cover-enter');
      if (!reducedMotion.matches) petals.start();
      (canContinue ? btnContinue : el.querySelector('.cover-new')).focus();
    },
    hide,
    get visible() { return !el.hidden; },
    /** Botón «Salir» (solo en el móvil; lo gestiona exit.js). */
    exitButton: el.querySelector('.cover-exit'),
  };
}
