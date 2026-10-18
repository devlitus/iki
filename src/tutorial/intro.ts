/**
 * Pergamino de entrada: antes del tutorial y de cada Nueva partida se desenrolla un kakejiku (rollo colgante) que cuenta
 * el Edo de los artesanos y el objetivo del juego. Con `tutorial` añade la nota del tutorial. Al cerrarlo (botón, Esc o fuera del rollo) se llama a `onClose`; `remove()` lo quita sin avisar.
 */

// Algunos de los 700-800 oficios de Edo que aparecen en las cartas, cada uno con su noren (cortina de tienda).
const TRADES = [
  ['提灯', 'Linternas'], ['扇', 'Abanicos'], ['畳', 'Tatamis'], ['版', 'Impresores'], ['棒手振', 'Vendedores'],
  ['鮨', 'Sushi'], ['天麩羅', 'Tempura'], ['芸者', 'Geishas'], ['歌舞伎', 'Kabuki'],
];
// Los kanji van en columna, uno por línea, como se pintan en la tela.
const noren = ([k, name]: string[]) => `<li><span class="noren-cloth" lang="ja">${[...k].join('<br>')}</span>${name}</li>`;

// Texto de «Bienvenidos a Edo» y «Objetivo del juego» del reglamento; las reglas las cuentan después las burbujas.
const html = (tutorial: boolean) => `
  <div class="scroll-rod top"></div>
  <article class="scroll-paper">
    <span class="scroll-seal" aria-hidden="true">粋</span>
    <p class="scroll-kicker">Periodo Edo · 1603–1868</p>
    <h2>Bienvenidos a Edo</h2>
    <p class="scroll-lead">Edo era el nombre de Tokio en aquel tiempo. En <b>Nihonbashi</b> latía el mercado más concurrido de la ciudad:
      a lo largo de su calle principal, comerciantes de todo tipo abrían sus tiendas e invitaban a pasar a sus clientes,
      y en el muelle cercano los barcos descargaban sus capturas entre las voces de vendedores y compradores de pescado.</p>
    <p class="scroll-cry" aria-hidden="true"><span lang="ja">いらっしゃい！</span> <i>¡Pasen, pasen!</i></p>
    <p class="scroll-lead">En las <b>Nagayas</b>, junto a la calle, vivían los artesanos y comerciantes que sostenían a la gente común.
      Se decía que había <b>entre 700 y 800 oficios</b>, y muchos te esperan en las cartas:</p>
    <div class="scroll-street">
      <ul class="scroll-noren" aria-label="Oficios de Edo">${TRADES.map(noren).join('')}</ul>
      <ul class="scroll-noren" aria-hidden="true">${TRADES.map(noren).join('')}</ul>
    </div>
    <p class="scroll-goal">Vive <b>un año entero</b> en Edo y conviértete en el mejor <b>Edokko</b>, «hijo de Edo».
      Gana quien reúna más <b>粋 IKI</b>, la forma ideal de vivir con estilo en la ciudad.</p>
    ${tutorial ? '<p class="scroll-note">En este tutorial jugarás un año entero; te iremos guiando.</p>' : ''}
    <button type="button" class="btn primary scroll-go">Entrar en Edo</button>
  </article>
  <div class="scroll-rod bottom"></div>`;

export function openIntro({ onClose, tutorial = true }: { onClose: () => void; tutorial?: boolean }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'tut-scroll';
  dialog.setAttribute('aria-label', 'Bienvenidos a Edo');
  dialog.innerHTML = html(tutorial);
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
  dialog.addEventListener('click', (e) => { if (e.target === dialog || (e.target as Element).closest('.scroll-go')) close(); });

  dialog.showModal();
  // El foco va al botón sin desplazar el papel, para que en pantallas bajas se lea desde el título.
  dialog.querySelector<HTMLElement>('.scroll-go')!.focus({ preventScroll: true });
  unroll(dialog);
  // remove: se quita sin avisar (el tutorial se cierra por otro lado).
  return { close, remove: () => { closing = true; dialog.close(); dialog.remove(); } };
}

/** El rollo baja desde la varilla de arriba: el papel se descubre y la varilla de abajo cae con él. */
function unroll(dialog: HTMLDialogElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const paper = dialog.querySelector<HTMLElement>('.scroll-paper')!;
  const rod = dialog.querySelector<HTMLElement>('.scroll-rod.bottom')!;
  const h = paper.offsetHeight;
  const timing: KeyframeAnimationOptions = { duration: 1100, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'backwards', delay: 250 };

  paper.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], timing);
  rod.animate([{ transform: `translateY(${-h}px)` }, { transform: 'none' }], timing);
}
