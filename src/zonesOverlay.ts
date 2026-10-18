import { ZONES, radiusV } from './data/zones.ts';

const GROUP_COLORS: Record<string, string> = {
  calendar: '#ffcc00',
  lots: '#00e5ff',
  street: '#ff3d71',
  queue: '#ff9f1c',
  shops: '#7cff4f',
  fire: '#ff5a1f',
  turn: '#c77dff',
  score: '#ff66c4',
};

/** Capa de depuración que dibuja todas las zonas sobre el tablero. Se alterna con toggle(). */
export function createZonesOverlay(boardEl: HTMLElement) {
  const layer = document.createElement('div');
  layer.id = 'zones';
  layer.hidden = true;

  for (const z of ZONES) {
    const el = document.createElement('div');
    el.className = `zone zone-${z.kind}`;
    el.dataset.id = z.id;
    el.title = `${z.label}\n${z.id}`;
    el.style.setProperty('--c', GROUP_COLORS[z.group] ?? '#fff');
    if (z.kind === 'rect') {
      Object.assign(el.style, { left: pct(z.x!), top: pct(z.y!), width: pct(z.w!), height: pct(z.h!) });
    } else {
      const rv = radiusV(z);
      Object.assign(el.style, { left: pct(z.cx! - z.r!), top: pct(z.cy! - rv), width: pct(z.r! * 2), height: pct(rv * 2) });
    }
    layer.appendChild(el);
  }

  // Debajo de las piezas.
  boardEl.insertBefore(layer, boardEl.querySelector('#pieces'));

  return {
    toggle: () => (layer.hidden = !layer.hidden),
  };
}

const pct = (n: number) =>
 `${(n * 100).toFixed(3)}%`;
