import { Window } from 'happy-dom';

/**
 * DOM simulado para pintar las vistas en Node. Va en un módulo aparte que modules.js importa el primero: algunos
 * módulos de la interfaz leen `window` o `matchMedia` al cargarse.
 */
const win = new Window({ url: 'http://iki.test/', width: 1440, height: 900 });

for (const key of ['window', 'document', 'navigator', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'HTMLElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'CustomEvent', 'DocumentFragment', 'MutationObserver', 'ResizeObserver']) {
  if (!(key in globalThis) || key === 'window' || key === 'document' || key === 'navigator') {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? win : win[key], configurable: true, writable: true });
  }
}

export const dom = win;
