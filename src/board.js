const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const FIT_MARGIN = 24;

/**
 * Tablero 2D: encaja la imagen en la ventana, permite zoom (rueda / pellizco) y desplazamiento,
 * y ofrece una capa de piezas posicionadas en coordenadas normalizadas (u, v en 0..1,
 * origen arriba-izquierda), independientes de la resolución de la imagen y del zoom.
 */
export async function createBoard({ viewport, board, image, pieces }) {
  await image.decode();
  const aspect = image.naturalWidth / image.naturalHeight;

  let zoom = 1;
  let tx = 0;
  let ty = 0;

  function apply() {
    board.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  }

  /** Ajusta el tablero al tamaño de la ventana y lo centra sin zoom. */
  function fit() {
    const vw = viewport.clientWidth - FIT_MARGIN * 2;
    const vh = viewport.clientHeight - FIT_MARGIN * 2;
    const w = Math.min(vw, vh * aspect);
    const h = w / aspect;
    board.style.width = `${w}px`;
    board.style.height = `${h}px`;
    zoom = 1;
    tx = (viewport.clientWidth - w) / 2;
    ty = (viewport.clientHeight - h) / 2;
    apply();
  }

  /** Cambia el zoom manteniendo fijo el punto de pantalla (cx, cy). */
  function zoomAt(cx, cy, factor) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (next === zoom) return;
    if (next === MIN_ZOOM) return fit();
    tx = cx - (cx - tx) * (next / zoom);
    ty = cy - (cy - ty) * (next / zoom);
    zoom = next;
    apply();
  }

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Arrastrar con un dedo/ratón desplaza; con dos dedos, pellizco para zoom.
  const pointers = new Map();
  let lastPinch = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.altKey || e.button !== 0) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.classList.add('dragging');
  });

  viewport.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / lastPinch);
      lastPinch = dist;
    } else if (zoom > MIN_ZOOM) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      apply();
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('dblclick', fit);
  window.addEventListener('resize', fit);

  /** Posición de pantalla → coordenadas normalizadas del tablero, o null si cae fuera. */
  function clientToUV(clientX, clientY) {
    const r = board.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
  }

  /** Coloca (o mueve) un elemento de la capa de piezas, centrado en (u, v). */
  function place(el, u, v) {
    el.style.left = `${u * 100}%`;
    el.style.top = `${v * 100}%`;
    if (el.parentElement !== pieces) pieces.appendChild(el);
    return el;
  }

  fit();
  return { fit, zoomAt, clientToUV, place, pieces };
}
