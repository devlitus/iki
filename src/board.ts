const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const FIT_MARGIN = 8;
const REVEAL_MARGIN = 0.2; // fracción de la vista, por cada lado, en la que una zona ya se ve bien
const REVEAL_MS = 450;

/**
 * Tablero 2D: encaja la imagen en la ventana, permite zoom (rueda / pellizco) y desplazamiento,
 * y ofrece una capa de piezas posicionadas en coordenadas normalizadas (u, v en 0..1,
 * origen arriba-izquierda), independientes de la resolución de la imagen y del zoom.
 */
export async function createBoard({ viewport, board, image, pieces }: {
  viewport: HTMLElement;
  board: HTMLElement;
  image: HTMLImageElement;
  pieces: HTMLElement;
}) {
  await image.decode();
  const aspect = image.naturalWidth / image.naturalHeight;

  let zoom = 1;
  let tx = 0;
  let ty = 0;
  let revealFrame = 0; // desplazamiento suave en curso (reveal)

  function apply() {
    board.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  }

  /** Ajusta el tablero al tamaño de la ventana y lo centra sin zoom. */
  function fit() {
    cancelAnimationFrame(revealFrame);
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
  function zoomAt(cx: number, cy: number, factor: number) {
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
    cancelAnimationFrame(revealFrame);
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // Arrastrar con un dedo/ratón desplaza; con dos dedos, pellizco para zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let lastPinch = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.altKey || e.button !== 0) return;
    cancelAnimationFrame(revealFrame); // quien arrastra manda
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

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('dblclick', fit);
  // La celda del tablero cambia de tamaño con la ventana y con los asientos de alrededor.
  new ResizeObserver(fit).observe(viewport);

  /** Posición de pantalla → coordenadas normalizadas del tablero, o null si cae fuera. */
  function clientToUV(clientX: number, clientY: number) {
    const r = board.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
  }

  /** Coloca (o mueve) un elemento de la capa de piezas, centrado en (u, v). */
  function place<T extends HTMLElement>(el: T, u: number, v: number): T {
    el.style.left = `${u * 100}%`;
    el.style.top = `${v * 100}%`;
    if (el.parentElement !== pieces) pieces.appendChild(el);
    return el;
  }

  /**
   * Con el tablero ampliado, si el punto (u, v) cae fuera de la parte central de la vista, desplaza el tablero (sin
   * cambiar el zoom) hasta centrarlo: así se ve lo que hace la IA. Sin zoom ya se ve todo y no hace nada; tampoco si
   * se está arrastrando o pellizcando.
   */
  function reveal(u: number, v: number) {
    if (zoom === MIN_ZOOM || pointers.size) return;
    const w = board.offsetWidth * zoom;
    const h = board.offsetHeight * zoom;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const x = tx + u * w;
    const y = ty + v * h;
    if (x >= vw * REVEAL_MARGIN && x <= vw * (1 - REVEAL_MARGIN) && y >= vh * REVEAL_MARGIN && y <= vh * (1 - REVEAL_MARGIN)) return;
    const from = { x: tx, y: ty };
    const to = { x: vw / 2 - u * w, y: vh / 2 - v * h };
    cancelAnimationFrame(revealFrame);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ({ x: tx, y: ty } = to);
      return apply();
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / REVEAL_MS);
      const ease = 1 - (1 - k) ** 3;
      tx = from.x + (to.x - from.x) * ease;
      ty = from.y + (to.y - from.y) * ease;
      apply();
      if (k < 1) revealFrame = requestAnimationFrame(step);
    };
    revealFrame = requestAnimationFrame(step);
  }

  fit();
  return { fit, zoomAt, clientToUV, place, reveal, pieces };
}

export type Board = Awaited<ReturnType<typeof createBoard>>;

