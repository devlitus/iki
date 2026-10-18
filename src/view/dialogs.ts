import { EVENT_LOG_TYPES, cardSummary, logLine, playerColor, playerName, typeLabel } from './format.ts';
import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { BUILDINGS_BY_ID } from '../data/decks.ts';
import { NAGAYAS_BY_ID, fireTileImage } from '../data/zones.ts';
import type { Game, LogEntry, Score } from '../types.ts';


/** Diálogos a pantalla completa: resumen del Evento del mes, tabla de puntuación final y ampliación de cartas. */

function makeDialog(id: string) {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'iki-dialog';
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog || (e.target as Element).closest('.close')) dialog.close(); });
  return dialog;
}

/** Entradas del Día de Pago que son cobros (columna Salario); el resto es el pago en arroz. */
const PAYDAY_INCOME = ['salary', 'harmony'];

const list = (game: Game, lines: LogEntry[]) => lines.length
  ? `<ul>${lines.map((e) => `<li>${logLine(game, e)}</li>`).join('')}</ul>`
  : '<p class="muted">Nada</p>';

/** Lo ocurrido en el Evento (Día de Pago, Incendio): las entradas nuevas del registro, agrupadas. */
export function createEventSummary({ onClose = () => {} } = {}) {
  const dialog = makeDialog('event-summary');
  dialog.addEventListener('close', () => onClose());
  return {
    /** Muestra el resumen de las entradas `entries` si hay algo que contar. Devuelve el Nagaya que arde, si hubo Incendio. */
    show(game: Game, entries: LogEntry[]): string | null {
      const lines = entries.filter((e) => EVENT_LOG_TYPES.includes(e.type));
      if (!lines.length) return null;
      const fire = lines.some((e) => e.type.startsWith('fire') || e.type === 'burned');
      // Si el incendio se paró a esperar una decisión, su inicio quedó en un registro anterior.
      const start = (fire ? game.log.findLast((e) => e.type === 'fire-start') : null) as (LogEntry & { nagaya: string; player: number }) | null | undefined;
      dialog.innerHTML = `
        <h2>${fire ? 'Incendio' : 'Día de Pago'} · mes ${lines[0].month}</h2>
        ${start ? `<figure class="fire-tile-drawn">
          <img src="${fireTileImage(start.nagaya)}" alt="Loseta de Incendio del Nagaya ${NAGAYAS_BY_ID[start.nagaya].name}">
          <figcaption>${playerName(game, start.player)} roba la loseta: arde el Nagaya ${NAGAYAS_BY_ID[start.nagaya].name}</figcaption>
        </figure>` : ''}
        ${fire ? list(game, lines) : `<div class="payday-columns">
          <section><h3>Salario</h3>${list(game, lines.filter((e) => PAYDAY_INCOME.includes(e.type)))}</section>
          <section><h3>Pago</h3>${list(game, lines.filter((e) => !PAYDAY_INCOME.includes(e.type)))}</section>
        </div>`}
        <button type="button" class="btn close" autofocus>Continuar</button>`;
      if (!dialog.open) dialog.showModal();
      return start?.nagaya ?? null;
    },
  };
}

/** Filas de la tabla de puntuación, como la libreta del juego. */
const ROWS = [
  ['track', 'Marcador', 'IKI del marcador'],
  ['variety', 'Variedad', 'Tipos de personaje distintos: 1, 4, 9, 16 o 25'],
  ['fish', 'Pescado', 'Pescados de estaciones distintas, más los extras'],
  ['tobacco', 'Tabaco', 'Bolsas de Tabaco (el doble con una Pipa)'],
  ['buildings', 'Edificios', 'IKI de tus Edificios'],
  ['resources', 'Recursos', '3 por Koban, 1 por madera, 1 por cada 4 mons'],
];

export function createFinalTable({ onNewGame }: { onNewGame: () => void }) {
  const dialog = makeDialog('final-table');
  dialog.addEventListener('click', (e) => { if ((e.target as Element).closest('.new-game')) { dialog.close(); onNewGame(); } });
  return {
    open(game: Game) {
      const { scores, ranking, winner } = game.final!;
      const order = game.turnOrder;
      const place = (p: number) => ranking.indexOf(p) + 1;
      dialog.innerHTML = `
        <h2>Puntuación final</h2>
        <p class="muted">Gana <b style="color:${playerColor(game, winner)}">${playerName(game, winner)}</b> con ${scores[winner].total} IKI.
          Desempate: Extinción de Incendios y posición en la pila.</p>
        <table class="score-table">
          <thead><tr><th></th>${order.map((p) => `<th class="${p === winner ? 'winner' : ''}" style="--player-color:${playerColor(game, p)}">
            ${playerName(game, p)}</th>`).join('')}</tr></thead>
          <tbody>
            ${ROWS.map(([key, label, hint]) => `<tr><th scope="row" title="${hint}">${label}</th>${order.map((p) =>
              `<td class="${p === winner ? 'winner' : ''}">${scores[p][key as keyof Score]}</td>`).join('')}</tr>`).join('')}
            <tr class="total"><th scope="row">Total</th>${order.map((p) => `<td class="${p === winner ? 'winner' : ''}">${scores[p].total}</td>`).join('')}</tr>
            <tr><th scope="row">Puesto</th>${order.map((p) => `<td>${place(p)}.º</td>`).join('')}</tr>
          </tbody>
        </table>
        <div class="final-detail">${order.map((p) => detail(game, p)).join('')}</div>
        <footer><button type="button" class="btn close">Cerrar</button><button type="button" class="btn new-game">Nueva partida</button></footer>`;
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0; // el foco va al botón «Cerrar» del final: en pantallas bajas, se vuelve arriba para ver quién gana
    },
  };
}

/** Lo que tiene cada jugador al final: personajes recogidos, edificios, pescados y fichas. */
function detail(game: Game, p: number) {
  const player = game.players[p];
  const names = (ids: string[], defs: Record<string, { name: string }>) => ids.map((id) => defs[id]?.name ?? id).join(', ') || '—';
  return `<section style="--player-color:${playerColor(game, p)}"><h3>${playerName(game, p)}</h3>
    <p><b>Personajes:</b> ${names(player.retired, CHARACTERS_BY_ID)}</p>
    <p><b>Edificios:</b> ${names(player.buildings, BUILDINGS_BY_ID)}</p>
    <p><b>Pescado:</b> ${player.fish.length} · <b>Pipas:</b> ${player.pipes.length} · <b>Tabaco:</b> ${player.tobacco.length}</p>
    ${player.wildType ? `<p><b>Comodín:</b> ${typeLabel(player.wildType)}</p>` : ''}</section>`;
}

/**
 * Al pasar el ratón por una carta o ficha con `data-zoom`, se ve grande junto al puntero; si es una carta de
 * personaje o de edificio, con el resumen de lo que hace al lado.
 */
export function initZoom() {
  const zoom = document.createElement('div');
  zoom.id = 'card-zoom';
  zoom.hidden = true;
  zoom.innerHTML = '<img alt=""><aside class="card-summary"></aside>';
  document.body.append(zoom);
  const img = zoom.querySelector('img')!;
  const summary = zoom.querySelector('aside')!;
  let current: HTMLElement | null = null;
  const place = (e: PointerEvent) => {
    const w = zoom.offsetWidth || 300;
    zoom.style.left = `${e.clientX + 24 + w > innerWidth ? e.clientX - 24 - w : e.clientX + 24}px`;
    zoom.style.top = `${Math.max(8, Math.min(e.clientY - 40, innerHeight - zoom.offsetHeight - 8))}px`;
  };
  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element).closest?.<HTMLElement>('[data-zoom]');
    if (target === current) return;
    current = target;
    if (!target || e.pointerType === 'touch') { zoom.hidden = true; return; }
    img.src = target.dataset.zoom!;
    summary.innerHTML = cardSummary(target.dataset.zoom!);
    summary.hidden = !summary.innerHTML;
    zoom.hidden = false;
    place(e);
  });
  document.addEventListener('pointermove', (e) => {
    if (current && !current.isConnected) { zoom.hidden = true; current = null; } // la pieza se redibujó mientras estaba el puntero encima
    if (current) place(e);
  });
  document.addEventListener('pointerdown', () => { zoom.hidden = true; current = null; });
}

