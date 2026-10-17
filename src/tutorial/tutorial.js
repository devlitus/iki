import './tutorial.css';
import { ZONES_BY_ID, zoneCenter } from '../data/zones.js';
import { STEPS, currentStep, stepAllows, stepZones } from './script.js';
import { isMobileLayout } from '../view/mobile.js';

const GAP = 16;    // separación entre la burbuja y lo que señala (aquí cabe el rabito)
const MARGIN = 10; // separación mínima con el borde de la ventana
const BIG = 0.3;   // fracción de la ventana a partir de la cual lo señalado es demasiado grande para apuntarlo

/** Rectángulo en pantalla de todo lo que marca el paso (anillos del tablero y elementos resaltados), o null. */
function anchorRect() {
  const rects = [...document.querySelectorAll('.tut-spot, .tut-focus')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

/**
 * Tutorial: una burbuja de ayuda junto a lo que explica (con rabito), marcas sobre el tablero y un filtro para que el
 * humano solo pueda hacer lo que pide el paso en curso. No tiene estado de partida: el paso se deduce de la partida
 * (script.js) y aquí solo se recuerdan los pasos informativos ya leídos.
 *
 * @param {{ coach: HTMLElement, board: object, onChange(): void, onExit(options: { keep: boolean }): void }} o
 *   onChange: se ha leído un paso informativo (hay que redibujar y dejar jugar a la IA).
 *   onExit:   el jugador sale; `keep` = sigue jugando esta partida (la del tutorial) como una normal.
 */
export function createTutorial({ coach, board, onChange, onExit }) {
  const acked = new Set();
  const stepOf = (game) => currentStep(game, acked);

  coach.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut]');
    if (!b) return;
    if (b.dataset.tut === 'next') { acked.add(b.dataset.step); onChange(); }
    else onExit({ keep: b.dataset.tut === 'keep' });
  });

  /** Marca una zona del tablero con un anillo (no se pulsa; solo señala). */
  function spot(id) {
    const zone = ZONES_BY_ID[id];
    const el = document.createElement('div');
    el.className = 'tut-spot';
    if (zone.kind === 'rect') {
      el.style.width = `${zone.w * 100}%`;
      el.style.height = `${zone.h * 100}%`;
    } else {
      el.style.width = `${zone.r * 200}%`;
      el.style.aspectRatio = '1';
      el.style.borderRadius = '50%';
    }
    const { u, v } = zoneCenter(zone);
    board.place(el, u, v);
  }

  function renderCoach(step, game) {
    const total = STEPS.length;
    const actions = step.last
      ? '<button type="button" class="btn primary" data-tut="keep">Seguir jugando</button><button type="button" class="btn" data-tut="exit">Volver al menú</button>'
      : step.kind === 'info' ? `<button type="button" class="btn primary" data-tut="next" data-step="${step.id}">Siguiente</button>` : '';
    coach.innerHTML = `
      <header title="Arrastra para mover la burbuja"><span class="label">Tutorial · ${STEPS.indexOf(step) + 1} de ${total}</span>
        ${step.last ? '' : '<button type="button" class="tut-close" data-tut="exit" aria-label="Salir del tutorial" title="Volver al menú; tu partida guardada no cambia">×</button>'}</header>
      <h2>${step.title}</h2>
      <div class="tut-text">${step.text(game, { mobile: isMobileLayout() })}</div>
      ${actions ? `<footer>${actions}</footer>` : ''}`;
    coach.hidden = false;
  }

  // La burbuja se coloca junto a lo señalado: al lado donde más sitio hay, con el rabito apuntándole. Si no señala nada, o
  // es demasiado grande para apuntarlo, o no cabe, se ancla abajo en el centro del tablero. Como el tablero se mueve y
  // se amplía, se recoloca mientras la burbuja está abierta (solo escribe cuando algo ha cambiado).
  let placedKey = null;
  let raf = 0;
  let moved = false;  // el jugador ha arrastrado la burbuja: no se recoloca hasta el paso siguiente
  let shownStep = null;

  // Arrastrar por la cabecera, por si la burbuja tapa algo que hay que pulsar.
  coach.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest('header');
    if (!bar || e.target.closest('button') || e.button !== 0) return;
    const dx = e.clientX - coach.offsetLeft;
    const dy = e.clientY - coach.offsetTop;
    const drag = (ev) => {
      coach.style.left = `${clamp(ev.clientX - dx, 0, innerWidth - coach.offsetWidth)}px`;
      coach.style.top = `${clamp(ev.clientY - dy, 0, innerHeight - coach.offsetHeight)}px`;
    };
    const drop = () => {
      bar.removeEventListener('pointermove', drag);
      bar.removeEventListener('pointerup', drop);
      bar.removeEventListener('pointercancel', drop);
    };
    moved = true;
    coach.dataset.tail = 'none';
    bar.setPointerCapture(e.pointerId);
    bar.addEventListener('pointermove', drag);
    bar.addEventListener('pointerup', drop);
    bar.addEventListener('pointercancel', drop);
  });

  function place() {
    if (coach.hidden || moved) return;
    const a = anchorRect();
    const w = coach.offsetWidth;
    const h = coach.offsetHeight;
    const W = innerWidth;
    const H = innerHeight;
    const key = [w, h, W, H, ...(a ? [a.left, a.top, a.right, a.bottom].map(Math.round) : [])].join();
    if (key === placedKey) return;
    placedKey = key;

    const visible = a && a.right > 0 && a.left < W && a.bottom > 0 && a.top < H;
    const sides = visible && (a.width * a.height) / (W * H) < BIG ? {
      right: { room: W - a.right - MARGIN - w - GAP, tail: 'left' },
      left: { room: a.left - MARGIN - w - GAP, tail: 'right' },
      bottom: { room: H - a.bottom - MARGIN - h - GAP, tail: 'top' },
      top: { room: a.top - MARGIN - h - GAP, tail: 'bottom' },
    } : {};
    const [side, spot] = Object.entries(sides).filter(([, s]) => s.room >= 0).sort((p, q) => q[1].room - p[1].room)[0] ?? [];

    let left;
    let top;
    if (!side) {
      const vp = document.getElementById('viewport').getBoundingClientRect();
      left = vp.left + (vp.width - w) / 2;
      top = vp.bottom - h - GAP;
      coach.dataset.tail = 'none';
    } else {
      const cx = (a.left + a.right) / 2;
      const cy = (a.top + a.bottom) / 2;
      left = side === 'right' ? a.right + GAP : side === 'left' ? a.left - GAP - w : cx - w / 2;
      top = side === 'bottom' ? a.bottom + GAP : side === 'top' ? a.top - GAP - h : cy - h / 2;
      left = clamp(left, MARGIN, W - w - MARGIN);
      top = clamp(top, MARGIN, H - h - MARGIN);
      // El rabito apunta al centro de lo señalado, sin salirse de la esquina redondeada de la burbuja.
      const along = spot.tail === 'left' || spot.tail === 'right' ? cy - top : cx - left;
      const length = spot.tail === 'left' || spot.tail === 'right' ? h : w;
      coach.style.setProperty('--tail', `${clamp(along, 22, length - 22)}px`);
      coach.dataset.tail = spot.tail;
    }
    coach.style.left = `${Math.round(left)}px`;
    coach.style.top = `${Math.round(top)}px`;
  }

  const track = () => {
    place();
    raf = requestAnimationFrame(track);
  };

  return {
    /** ¿Hay que parar a la IA? Mientras se lee un paso informativo, el tablero no cambia. */
    blocking: (game) => stepOf(game)?.kind === 'info',

    /** Motivo por el que se rechaza una jugada del humano, o null si el paso en curso la acepta. */
    refuse(game, action) {
      const step = stepOf(game);
      if (!step || stepAllows(step, game, action)) return null;
      if (step.kind === 'info') return 'Pulsa «Siguiente» en el tutorial para continuar.';
      return step.deny?.(game, action) ?? `El tutorial te pide otra cosa ahora: «${step.title}».`;
    },

    /** Deja solo las zonas del tablero que el paso permite pulsar. */
    filterTargets(game, targets) {
      const zones = stepZones(stepOf(game), game);
      return zones ? targets.filter((t) => zones.includes(t.zone)) : targets;
    },

    /** Redibuja la tarjeta y las marcas; hay que llamarlo después de pintar el tablero (que borra las marcas). */
    update(game) {
      const step = stepOf(game);
      if (!step) return;
      renderCoach(step, game);
      step.spots?.(game).forEach(spot);
      document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
      step.focus?.(game).forEach((selector) => document.querySelectorAll(selector).forEach((el) => el.classList.add('tut-focus')));
      if (step.id !== shownStep) moved = false;
      shownStep = step.id;
      placedKey = null;
      place();
      if (!raf) raf = requestAnimationFrame(track);
    },

    /** Quita la burbuja y las marcas. */
    close() {
      cancelAnimationFrame(raf);
      raf = 0;
      moved = false;
      shownStep = null;
      coach.hidden = true;
      coach.replaceChildren();
      document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
    },
  };
}
