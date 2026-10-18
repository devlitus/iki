import { playerColor, playerName } from './format.ts';
import type { Game } from '../types.ts';

/**
 * Animación de la tirada de dados para el jugador inicial (paso 10), justo después de pulsar Empezar en una partida
 * nueva. Solo enseña lo que ya decidió createGame(): las tiradas de cada jugador (`players[i].rolls`, una por ronda) y
 * quién empieza. Cada ronda tiran los que siguen empatados en la cifra más alta; el resto se queda con su dado quieto.
 *
 * `show(game)` devuelve una promesa que se cumple al cerrar. «Saltar» pasa directamente al resultado.
 */

const TUMBLE_MS = 900; // lo que ruedan los dados
const PAUSE_MS = 1100; // pausa para leer el resultado de cada ronda
const FACE_MS = 90; // cada cuánto cambia la cara mientras rueda

// Posición de los puntos de cada cara en una rejilla de 3 × 3 (0-8, de izquierda a derecha y de arriba abajo).
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const randomFace = () => 1 + Math.floor(Math.random() * 6);

function setFace(die: HTMLElement, value: number) {
  die.dataset.value = value as unknown as string;
  die.setAttribute('aria-label', `Dado: ${value}`);
  die.replaceChildren(...Array.from({ length: 9 }, (_, k) => {
    const cell = document.createElement('span');
    if (PIPS[value].includes(k)) cell.className = 'pip';
    return cell;
  }));
}

export function createDiceRoll() {
  const overlay = document.createElement('div');
  overlay.id = 'dice-roll';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="dice-panel" role="dialog" aria-modal="true" aria-labelledby="dice-title">
      <h2 id="dice-title">¿Quién empieza?</h2>
      <p class="dice-help">Cada jugador tira un dado: empieza el más alto. Si hay empate en la cifra más alta, solo los
        empatados vuelven a tirar.</p>
      <ol class="dice-rows"></ol>
      <p class="dice-status" aria-live="polite"></p>
      <footer class="dice-actions">
        <button type="button" class="dice-skip">Saltar</button>
        <button type="button" class="dice-done" hidden>Continuar</button>
      </footer>
    </div>`;
  document.body.append(overlay);

  const rowsEl = overlay.querySelector<HTMLElement>('.dice-rows')!;
  const status = overlay.querySelector<HTMLElement>('.dice-status')!;
  const btnSkip = overlay.querySelector<HTMLButtonElement>('.dice-skip')!;
  const btnDone = overlay.querySelector<HTMLButtonElement>('.dice-done')!;

  let run = 0; // cada show() o salto invalida los temporizadores de la animación anterior
  let resolve: (() => void) | null = null;
  let finish = () => {};

  btnSkip.addEventListener('click', () => finish());
  btnDone.addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (btnDone.hidden) finish();
      else close();
    }
  });

  const wait = (ms: number, id: number) => new Promise<void>((ok, fail) => setTimeout(() => (id === run ? ok() : fail()), ms));

  function show(game: Game): Promise<void> {
    const id = ++run;
    const n = game.players.length;
    const rolls = game.players.map((p) => p.rolls);
    const rounds = Math.max(...rolls.map((r) => r.length));
    const name = (i: number) => playerName(game, i);

    rowsEl.replaceChildren(...game.players.map((_, i) => {
      const row = document.createElement('li');
      row.className = 'dice-row';
      row.style.setProperty('--player-color', playerColor(game, i));
      row.innerHTML = `<span class="dice-name">${name(i)}</span><span class="dice-tray"></span>`;
      return row;
    }));
    const rows = [...rowsEl.children] as HTMLElement[];
    status.textContent = '';
    btnSkip.hidden = false;
    btnDone.hidden = true;
    overlay.hidden = false;
    btnSkip.focus();

    /** Pone el resultado final: todos los dados en su sitio y el ganador destacado. */
    function showResult() {
      run++;
      rows.forEach((row, i) => {
        const tray = row.querySelector('.dice-tray')!;
        tray.replaceChildren(...rolls[i].map((v, r) => die(v, r < rolls[i].length - 1)));
        row.classList.toggle('out', i !== game.starter);
        row.classList.toggle('winner', i === game.starter);
      });
      status.innerHTML = `Empieza <b class="who-name" style="--player-color:${playerColor(game, game.starter)}">${name(game.starter)}</b>:
        elige primero su personaje inicial y juega el primer turno.`;
      btnSkip.hidden = true;
      btnDone.hidden = false;
      btnDone.focus();
    }
    finish = showResult;

    async function animate() {
      let rolling = [...Array(n).keys()];
      for (let r = 0; r < rounds; r++) {
        status.textContent = r === 0 ? 'Tiran todos…' : `Vuelven a tirar ${rolling.map(nameText).join(' y ')}…`;
        // Los que ya tiraron antes atenúan su dado anterior: cuenta el nuevo.
        const dice = rolling.map((i) => {
          const tray = rows[i].querySelector('.dice-tray')!;
          tray.querySelectorAll('.die').forEach((d) => d.classList.add('old'));
          const d = die(randomFace());
          tray.append(d);
          return d;
        });
        if (!reducedMotion()) {
          dice.forEach((d) => d.classList.add('rolling'));
          const flicker = setInterval(() => dice.forEach((d) => setFace(d, randomFace())), FACE_MS);
          try { await wait(TUMBLE_MS, id); } finally { clearInterval(flicker); }
          dice.forEach((d) => d.classList.remove('rolling'));
        }
        rolling.forEach((i, k) => setFace(dice[k], rolls[i][r]));
        const top = Math.max(...rolling.map((i) => rolls[i][r]));
        const out = rolling.filter((i) => rolls[i][r] !== top);
        out.forEach((i) => rows[i].classList.add('out'));
        rolling = rolling.filter((i) => rolls[i][r] === top);
        if (rolling.length > 1) {
          rolling.forEach((i) => rows[i].classList.add('tied'));
          status.textContent = `¡Empate a ${top}!`;
          await wait(PAUSE_MS, id);
          rolling.forEach((i) => rows[i].classList.remove('tied'));
        } else {
          await wait(PAUSE_MS / 2, id);
        }
      }
      showResult();
    }

    /** Nombre sin HTML, para el texto de estado. */
    function nameText(i: number) {
      const tmp = document.createElement('span');
      tmp.innerHTML = name(i);
      return tmp.textContent;
    }

    animate().catch(() => {}); // un salto o un show() nuevo corta la animación: no es un error
    return new Promise((ok) => { resolve = ok; });
  }

  function die(value: number, old = false) {
    const d = document.createElement('span');
    d.className = `die${old ? ' old' : ''}`;
    d.setAttribute('role', 'img');
    setFace(d, value);
    return d;
  }

  function close() {
    run++;
    overlay.hidden = true;
    resolve?.();
    resolve = null;
  }

  return { show, close, get isOpen() { return !overlay.hidden; } };
}
