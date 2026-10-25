import { act } from '../game/engine.ts';
import { deciderOf } from '../ai/player.ts';
import { cardName, logLine, playerColor, playerName, who } from './format.ts';
import { isMobileLayout } from './mobile.ts';
import type { Action, Game, LogEntry } from '../types.ts';

/**
 * Ritmo de las jugadas de la IA: cada una se juega en dos tiempos, primero se anuncia (la zona del tablero y la carta
 * que va a usar se iluminan y la franja de arriba dice qué hace) y después se aplica. La velocidad la elige el jugador y
 * se recuerda en este navegador. En móvil no hay franja, que taparía el tablero: solo se ilumina la zona.
 */
export type Speed = 'slow' | 'normal' | 'fast';
const SPEEDS: { id: Speed; label: string; factor: number }[] = [
  { id: 'slow', label: 'Lenta', factor: 1.8 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'fast', label: 'Rápida', factor: 0.35 },
];
const SPEED_KEY = 'iki.aiSpeed';
const PREVIEW_MS = 1000; // anuncio de una jugada que señala algo en el tablero
const PREVIEW_PLAIN_MS = 700; // anuncio de una jugada sin zona (cobrar ingresos)
const THINK_MS = 450; // pausa entre dos jugadas del mismo jugador
const NEXT_PLAYER_MS = 1000; // pausa al pasar el turno a otro jugador
const LINGER_MS = 1800; // la franja sigue a la vista un poco después de la última jugada de la IA

/** Lo que se ilumina mientras se anuncia una jugada: una zona del tablero y una carta de la Mesa. */
export type Focus = { zone: string | null; card: string | null; initial: boolean };

/** Jugada elegida por la IA, a la espera de aplicarse en `due` (sobre la partida `game`, tal como estaba). */
export type AiPlan = { game: Game; action: Action; focus: Focus; due: number };

/** Dónde se ve la jugada: para el movimiento, la casilla a la que llega (se calcula con el motor). */
export function focusOf(game: Game, action: Action, next: Game | null): Focus {
  const none = { zone: null, card: null, initial: false };
  switch (action.type) {
    case 'placeInitial': return { zone: action.lot, card: action.card, initial: true };
    case 'placeIkizama': return { ...none, zone: `turn-${action.slot}` };
    case 'hire': return { zone: action.lot, card: action.card, initial: false };
    case 'move': return { ...none, zone: next?.players[game.turn!.player].oyakata ?? null };
    case 'place': return { ...none, zone: action.zone };
    case 'shop': return { ...none, zone: action.lot ?? game.players[game.turn!.player].oyakata ?? null };
    case 'character': return { ...none, zone: action.buildLot ?? action.lot };
    default: return none;
  }
}

/**
 * En línea solo llega el resultado: las jugadas de la IA se repasan con lo que dicen sus entradas del registro. Estas
 * son las que abren una jugada; las demás (Extinción, retiros…) son lo que esa jugada provoca.
 */
const STEP_TYPES = ['income', 'hire', 'move', 'place', 'shop', 'character', 'build'];

/** Una jugada de la IA en línea, ya jugada: quién, dónde se ve y qué dice el registro. */
type Step = { game: Game; player: number; zone: string | null; lines: string[] };

/** Zona de una entrada del registro. La del personaje activado se busca por su carta (si sigue en el tablero). */
function entryZone(game: Game, e: LogEntry): string | null {
  if (e.type === 'hire' || e.type === 'build') return e.lot as string;
  if (e.type === 'move' || e.type === 'place') return e.to as string;
  if (e.type === 'shop') return e.shop as string;
  if (e.type === 'character') return Object.keys(game.lots).find((lot) => game.lots[lot].card === e.card) ?? null;
  return null;
}

/** Texto de las jugadas que el motor no apunta en el registro. */
function unlogged(game: Game, p: number, action: Action) {
  if (action.type === 'placeInitial') return [`${who(game, p)} coloca a ${cardName(action.card)} en un solar exterior`];
  if (action.type === 'placeIkizama') return [`${who(game, p)} pone su Ikizama en el turno ${action.slot}`];
  return [];
}

export function createAiPace({ onSkip, onPause, onReplay }: {
  onSkip: () => void;
  onPause: (paused: boolean) => void;
  /** Jugada en línea que se está repasando (o null al acabar): main.ts ilumina su zona. */
  onReplay: (step: { zone: string | null; player: number } | null) => void;
}) {
  let speed: Speed = 'normal';
  try {
    const saved = localStorage.getItem(SPEED_KEY) as Speed | null;
    if (SPEEDS.some((s) => s.id === saved)) speed = saved!;
  } catch { /* sin almacenamiento: velocidad normal */ }
  let paused = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let queue: Step[] = []; // jugadas en línea pendientes de repasar
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let replaying = false;
  const factor = () => SPEEDS.find((s) => s.id === speed)!.factor;

  const strip = document.createElement('div');
  strip.id = 'ai-strip';
  strip.hidden = true;
  strip.innerHTML = `<p class="ai-strip-text"></p>
    <div class="ai-strip-controls">
      <div class="ai-speed" role="group" aria-label="Velocidad de la IA">${SPEEDS.map((s) =>
        `<button type="button" class="btn btn-sm" data-speed="${s.id}">${s.label}</button>`).join('')}</div>
      <button type="button" class="btn btn-sm" data-ai="pause"></button>
      <button type="button" class="btn btn-sm" data-ai="skip" title="Jugar ya la jugada anunciada (barra espaciadora)" aria-label="Siguiente jugada">
        <span aria-hidden="true">▸</span><span class="ai-label"> Siguiente</span></button>
    </div>`;
  document.getElementById('viewport')!.append(strip);
  const text = strip.querySelector<HTMLElement>('.ai-strip-text')!;
  strip.addEventListener('pointerdown', (e) => e.stopPropagation()); // que no arrastre el tablero
  strip.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.speed) {
      speed = b.dataset.speed as Speed;
      try { localStorage.setItem(SPEED_KEY, speed); } catch { /* se queda solo en esta sesión */ }
    } else if (b.dataset.ai === 'pause') {
      paused = !paused;
      if (replaying) paused ? clearTimeout(replayTimer as ReturnType<typeof setTimeout>) : nextStep();
      onPause(paused);
    } else if (b.dataset.ai === 'skip') skip();
    syncControls();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || strip.hidden || paused) return;
    if ((e.target as Element).closest('button, input, select, textarea, summary, [contenteditable]')) return;
    e.preventDefault();
    skip();
  });
  const skip = () => (replaying ? nextStep() : onSkip());

  function syncControls() {
    strip.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.speed === speed)));
    const pause = strip.querySelector<HTMLButtonElement>('[data-ai="pause"]')!;
    pause.innerHTML = `<span aria-hidden="true">${paused ? '▶' : '❚❚'}</span><span class="ai-label"> ${paused ? 'Seguir' : 'Pausa'}</span>`;
    pause.setAttribute('aria-label', paused ? 'Seguir' : 'Pausa');
    pause.setAttribute('aria-pressed', String(paused));
    strip.querySelector<HTMLButtonElement>('[data-ai="skip"]')!.disabled = paused;
  }
  syncControls();

  return {
    get paused() { return paused; },

    /** Prepara la jugada elegida: qué se ilumina y cuánto dura el anuncio. */
    plan(game: Game, action: Action): AiPlan {
      let next: Game | null = null;
      try { next = act(game, action); } catch { /* el motor la rechazará al aplicarla y se verá el error */ }
      const focus = focusOf(game, action, next);
      const p = deciderOf(game);
      const entries = next ? next.log.filter((e) => e.seq > (game.logSeq ?? 0) && e.type !== 'month') : [];
      entries.sort((x, y) => Number(y.type === action.type) - Number(x.type === action.type)); // la jugada, delante de lo que provoca
      const lines = entries.map((e) => logLine(next!, e));
      if (p != null) lines.unshift(...unlogged(game, p, action)); // jugadas que no dejan línea en el registro
      const announced = focus.zone || focus.card || action.type === 'income';
      if (lines.length) show(game, p, lines);
      const wait = announced ? (focus.zone || focus.card ? PREVIEW_MS : PREVIEW_PLAIN_MS) * factor() : 0;
      return { game, action, focus, due: performance.now() + wait };
    },

    /** Pausa antes de la siguiente jugada de la IA: más larga si cambia de jugador (o no se sabe quién jugó antes). */
    think(before?: Game, after?: Game) {
      return (before && after && deciderOf(before) === deciderOf(after) ? THINK_MS : NEXT_PLAYER_MS) * factor();
    },

    /**
     * Partida en línea: repasa una a una las jugadas de la IA llegadas del servidor desde `before` (las de las personas
     * no, que ya las ha visto quien las jugó). Si llegan más mientras tanto, se ponen a la cola.
     */
    replay(before: Game, game: Game) {
      const steps: Step[] = [];
      for (const e of game.log) {
        if (e.seq <= (before.logSeq ?? 0) || e.type === 'month' || e.player == null) continue;
        if (STEP_TYPES.includes(e.type)) {
          if (game.players[e.player].ai) steps.push({ game, player: e.player, zone: entryZone(game, e), lines: [logLine(game, e)] });
        } else if (steps.at(-1)?.player === e.player) steps.at(-1)!.lines.push(logLine(game, e));
      }
      if (!steps.length) return;
      queue.push(...steps);
      if (!replaying) nextStep();
    },

    /** Se sale de la partida en línea: se deja de repasar. */
    stopReplay() {
      queue = [];
      clearTimeout(replayTimer as ReturnType<typeof setTimeout>);
      if (replaying) { replaying = false; onReplay(null); }
    },

    /** Le toca a una IA (o acaba de jugar): la franja se ve; si no, se va al poco. */
    update(game: Game | null, aiTurn: boolean) {
      if (replaying) return;
      if (aiTurn && game && !isMobileLayout()) {
        clearTimeout(hideTimer as ReturnType<typeof setTimeout>);
        hideTimer = null;
        if (strip.hidden) show(game, deciderOf(game), []);
      } else if (!strip.hidden && !hideTimer) {
        hideTimer = setTimeout(() => { strip.hidden = true; hideTimer = null; }, game ? LINGER_MS : 0);
      }
    },
  };

  /** Siguiente jugada en línea por repasar: se ilumina y se cuenta durante lo que dura un anuncio más una pausa. */
  function nextStep() {
    clearTimeout(replayTimer as ReturnType<typeof setTimeout>);
    const step = queue.shift();
    if (!step) {
      replaying = false;
      onReplay(null);
      hideTimer = setTimeout(() => { strip.hidden = true; hideTimer = null; }, LINGER_MS);
      return;
    }
    clearTimeout(hideTimer as ReturnType<typeof setTimeout>);
    hideTimer = null;
    replaying = true;
    show(step.game, step.player, step.lines);
    onReplay({ zone: step.zone, player: step.player });
    const pause = queue[0] && queue[0].player !== step.player ? NEXT_PLAYER_MS : THINK_MS;
    if (!paused) replayTimer = setTimeout(nextStep, ((step.zone ? PREVIEW_MS : PREVIEW_PLAIN_MS) + pause) * factor());
  }

  /** Lo que hace (o va a hacer) `p`: la primera línea es la jugada; las demás, lo que provoca (como mucho dos). */
  function show(game: Game, p: number | null, lines: string[]) {
    if (p != null) strip.style.setProperty('--player-color', playerColor(game, p));
    const shown = lines.length > 3 ? [...lines.slice(0, 2), `y ${lines.length - 2} cosas más (ver el registro)`] : lines;
    text.innerHTML = shown.length ? shown.map((l) => `<span>${l}</span>`).join('') : `<span>Juega ${p != null ? `<b>${playerName(game, p)}</b>` : 'la IA'}…</span>`;
    strip.hidden = isMobileLayout(); // en móvil taparía el tablero: basta con la zona que se ilumina
    strip.classList.remove('fresh');
    void strip.offsetWidth; // vuelve a lanzar la animación de entrada
    strip.classList.add('fresh');
  }
}
