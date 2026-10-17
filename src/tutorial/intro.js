/**
 * Pergamino de entrada al tutorial: antes de la primera burbuja se desenrolla un kakejiku (rollo colgante) que cuenta el
 * objetivo del juego. Al cerrarlo (botón, Esc o fuera del rollo) se llama a `onClose`; `remove()` lo quita sin avisar.
 */

// Flor de cerezo de cinco pétalos, como las fichas de IKI del juego.
const flower = (color) => `<svg viewBox="-12 -12 24 24" aria-hidden="true">${[0, 72, 144, 216, 288]
  .map((a) => `<path d="M0 0C-5-3-5-9-1.6-10.6L0-9 1.6-10.6C5-9 5-3 0 0Z" fill="${color}" transform="rotate(${a})"/>`).join('')}
  <circle r="2.2" fill="#ffe7a3"/></svg>`;

const SEASONS = [['春', 'Primavera'], ['夏', 'Verano'], ['秋', 'Otoño'], ['冬', 'Invierno']];

const PATH = [
  ['雇', 'Contrata', 'artesanos y comerciantes y ponlos a vivir en los solares de la calle.'],
  ['商', 'Hazlos trabajar', 'mientras tu Oyakata recorre Nihonbashi y hace negocios con ellos.'],
  ['隠', 'Retíralos', 'cuando acumulen experiencia: cada jubilación te da IKI.'],
];

const HTML = `
  <div class="scroll-rod top"></div>
  <article class="scroll-paper">
    <span class="scroll-seal" aria-hidden="true">粋</span>
    <p class="scroll-kicker">Nihonbashi · Edo</p>
    <h2>El camino del Edokko</h2>
    <p class="scroll-lead">Vive <b>un año entero</b> en Edo y conviértete en el mejor <b>Edokko</b>, «hijo de Edo»,
      ayudando a que la ciudad y sus gentes prosperen.</p>
    <ol class="scroll-seasons" aria-label="Un año: cuatro estaciones de tres meses">
      ${SEASONS.map(([k, name]) => `<li><span lang="ja">${k}</span>${name}</li>`).join('')}
    </ol>
    <ol class="scroll-path">
      ${PATH.map(([k, verb, rest]) => `<li><span class="scroll-kanji" lang="ja" aria-hidden="true">${k}</span>
        <p><b>${verb}</b> ${rest}</p></li>`).join('')}
    </ol>
    <div class="scroll-goal">
      <p>Gana quien termine el año con más <b>IKI</b>, el arte de vivir con estilo.</p>
      <p class="scroll-flowers"><span>${flower('#f39bb5')} durante la partida</span><span>${flower('#c8323a')} al final</span></p>
    </div>
    <p class="scroll-note">En este tutorial jugarás <b>el primer mes</b> de la primavera, paso a paso.</p>
    <button type="button" class="btn primary scroll-go">Entrar en Edo</button>
  </article>
  <div class="scroll-rod bottom"></div>`;

export function openIntro({ onClose }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'tut-scroll';
  dialog.setAttribute('aria-label', 'Objetivo del juego');
  dialog.innerHTML = HTML;
  document.body.append(dialog);

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const done = () => { dialog.close(); dialog.remove(); onClose(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    dialog.classList.add('leaving');
    dialog.addEventListener('animationend', (e) => { if (e.target === dialog) done(); });
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('.scroll-go')) close(); });

  dialog.showModal();
  // El foco va al botón sin desplazar el papel, para que en pantallas bajas se lea desde el título.
  dialog.querySelector('.scroll-go').focus({ preventScroll: true });
  unroll(dialog);
  // remove: se quita sin avisar (el tutorial se cierra por otro lado).
  return { close, remove: () => { closing = true; dialog.close(); dialog.remove(); } };
}

/** El rollo baja desde la varilla de arriba: el papel se descubre y la varilla de abajo cae con él. */
function unroll(dialog) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const paper = dialog.querySelector('.scroll-paper');
  const rod = dialog.querySelector('.scroll-rod.bottom');
  const h = paper.offsetHeight;
  const timing = { duration: 1100, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'backwards', delay: 250 };
  paper.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], timing);
  rod.animate([{ transform: `translateY(${-h}px)` }, { transform: 'none' }], timing);
}
