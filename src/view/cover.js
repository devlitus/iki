import './cover.css';

/**
 * Portada: la caja del juego con «Nueva partida» y, si hay una guardada, «Continuar». Se muestra al entrar y se
 * puede volver a ella desde el menú. `onNew` y `onContinue` los decide quien la crea; la portada solo se oculta.
 */
export function createCover({ onNew, onContinue }) {
  const el = document.createElement('div');
  el.id = 'cover';
  el.innerHTML = `
    <img class="cover-art" src="/cover.webp" alt="IKI, el juego de los artesanos de Edo" draggable="false">
    <nav class="cover-menu" aria-label="Menú principal">
      <button type="button" class="btn cover-btn cover-continue">Continuar</button>
      <button type="button" class="btn cover-btn cover-new">Nueva partida</button>
      <p class="muted">3-4 jugadores en la misma pantalla</p>
    </nav>`;
  document.body.append(el);

  const btnContinue = el.querySelector('.cover-continue');
  const hide = () => { el.hidden = true; };
  el.querySelector('.cover-new').addEventListener('click', () => { hide(); onNew(); });
  btnContinue.addEventListener('click', () => { hide(); onContinue(); });

  return {
    /** Muestra la portada; «Continuar» solo si `canContinue`. */
    show(canContinue) {
      btnContinue.hidden = !canContinue;
      el.hidden = false;
      (canContinue ? btnContinue : el.querySelector('.cover-new')).focus();
    },
    hide,
  };
}
