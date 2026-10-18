import { esc } from './format.ts';

/**
 * Etiquetas propias en lugar de las del navegador: al pasar el ratón por cualquier elemento con `title`, sale una
 * ficha con el estilo de la mesa. El texto se trocea por « · »: lo primero es el título y el resto, una línea cada uno;
 * los mons llevan su moneda y los IKI se resaltan. Lo que tiene `data-zoom` ya se ve ampliado y no la lleva.
 */
const DELAY_MS = 250;

function tipHtml(text: string) {
  const [head, ...lines] = text.split(' · ').map((part) => esc(part)
    .replace(/^(\d+) mons?$/, 'Cuesta $&') // un precio suelto, como en las fichas del mercado
    .replace(/(\d+) mons?\b/g, '<span class="tip-mon"><span class="ic ic-mon"></span>$1</span>')
    .replace(/([+−-]?\d+ IKI)/g, '<b class="tip-iki">$1</b>'));
  return `<strong>${head}</strong>${lines.map((line) => `<span>${line}</span>`).join('')}`;
}

export function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let current: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | number = 0;

  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
    current = null;
  };
  const show = (el: HTMLElement) => {
    tip.innerHTML = tipHtml(el.dataset.tip!);
    tip.hidden = false;
    // Encima del elemento y centrada; si no cabe arriba, debajo. Siempre dentro de la ventana.
    const r = el.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = tip;
    const above = r.top - h - 8;
    tip.classList.toggle('below', above < 8);
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
    tip.style.top = `${above < 8 ? r.bottom + 8 : above}px`;
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = (e.target as Element).closest?.<HTMLElement>('[title], [data-tip]');
    if (el === current) return;
    const wasShown = !tip.hidden;
    hide();
    if (!el || el.closest('[data-zoom]')) return;
    // Se quita el `title` para que no salga también la etiqueta del navegador; el nombre accesible se conserva.
    if (el.hasAttribute('title')) {
      if (el.title && !el.hasAttribute('aria-label') && !el.textContent!.trim()
) el.setAttribute('aria-label', el.title);
      el.dataset.tip = el.title;
      el.removeAttribute('title');
    }
    if (!el.dataset.tip) return;
    current = el;
    // Si ya había una a la vista, la siguiente sale sin esperar: se puede recorrer el tablero de pieza en pieza.
    timer = setTimeout(() => current === el && el.isConnected && show(el), wasShown ? 0 : DELAY_MS);
  });
  document.addEventListener('pointermove', () => {
    if (current && !current.isConnected) hide(); // la pieza se redibujó mientras estaba el puntero encima
  });
  document.addEventListener('pointerout', (e) => e.relatedTarget || hide()); // salió de la ventana
  document.addEventListener('pointerdown', hide);
  document.addEventListener('wheel', hide, { passive: true });
  addEventListener('blur', hide);
}
