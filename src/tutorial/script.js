import { CHARACTERS_BY_ID } from '../data/characters.js';
import { ZONES_BY_ID, STREET, STREET_ENTRY, LOT_IDS } from '../data/zones.js';
import { tryAct } from '../game/engine.js';
import { isAiTurn } from '../ai/player.js';
import { abilityText, cardName, shopName, typeLabel, who } from '../view/format.js';

/**
 * Guion del tutorial: un mes completo (fases A, B y C) jugado por el humano contra dos IA. Es solo datos y funciones
 * puras sobre el estado de la partida; la burbuja y los resaltados los pinta tutorial.js.
 *
 * Cada paso:
 *   kind    'info'   explica y espera a «Siguiente» (mientras tanto las IA no juegan)
 *           'action' pide una jugada del humano; `allow` dice cuáles acepta
 *           'wait'   espera a que terminen los demás
 *   done    ¿ya está superado? Se deduce del estado (no hay puntero): el paso en curso es el primero que no lo está,
 *           así deshacer una jugada vuelve solo al paso que toca.
 *   text    HTML de la burbuja, según el estado y el dispositivo: text(g, { mobile }), con `mobile` = distribución para
 *           móvil (mesa y jugadores en paneles que se abren desde la barra; ver view/mobile.js).
 *   allow   (action) ¿acepta esta jugada?
 *   deny    (action, opcional) qué decir cuando se rechaza una jugada; por defecto, que toca otra cosa.
 *   zones   (action) zonas del tablero que se pueden pulsar; null = las que ofrezca el panel.
 *   spots   zonas del tablero que se marcan.
 *   focus   selectores CSS de lo que se marca fuera del tablero.
 */

// --- Dónde está el humano ------------------------------------------------------------------------

export const humanOf = (g) => g.players.findIndex((p) => !p.ai);

/** Cuánto ha avanzado el humano en el mes 1: 'before' | 'b1' | 'move' | 'business' | 'after'. */
export function progress(g) {
  if (g.month > 1) return 'after';
  if (g.phase !== 'actions') return 'before';
  const mine = g.turnList.indexOf(humanOf(g));
  if (g.turn.index < mine) return 'before';
  return g.turn.index === mine ? g.turn.step : 'after';
}

/** Casillas que hay que recorrer desde `from` hasta `to` siguiendo la calle (la salida entra por STREET_ENTRY). */
function stepsBetween(from, to) {
  let pos = from;
  for (let n = 0; n <= 9; n++) {
    if (pos === to) return n;
    pos = pos.startsWith('queue-') ? STREET_ENTRY : ZONES_BY_ID[pos].next;
  }
  return null;
}

/** Solar y casilla de la calle del personaje inicial del humano (null antes de colocarlo). */
function home(g) {
  const h = humanOf(g);
  const lot = Object.keys(g.lots).find((id) => g.lots[id].owner === h && g.lots[id].initial);
  if (!lot) return null;
  const cell = STREET.find((id) => ZONES_BY_ID[id].stalls.includes(lot));
  return { lot, cell, card: g.lots[lot].card };
}

const cellName = (cell) => `${ZONES_BY_ID[cell].label} · ${shopName(cell)}`;
const player = (g) => g.players[humanOf(g)];

/** Casilla a la que llegaría el humano con su Ikizama y `sandals` sandalias, desde el paso B1 o B2. */
function destination(g, sandals = 0) {
  const copy = structuredClone(g);
  copy.turn.step = 'move';
  return tryAct(copy, { type: 'move', sandals })?.players[humanOf(g)].oyakata ?? null;
}

/** Cartas de la fila que el humano puede contratar ahora en algún solar libre. */
function hireable(g) {
  const free = LOT_IDS.filter((id) => !g.lots[id]);
  return g.row.filter((r) => free.some((lot) => tryAct(g, { type: 'hire', card: r.card, lot })));
}

const SHOP_HELP = {
  'shop-rice': 'cambia 3 mons por 2 de arroz; sin arroz no puedes alimentar a tus personajes el Día de Pago',
  'shop-sandals': 'cambia 2 mons por 2 sandalias, que te dejan avanzar más en la calle',
  'shop-exchange': 'cambia mons por Koban (monedas de oro, muy valiosas al final) o cobra 2 mons',
  'shop-fish': 'compra una ficha de Pescado: da IKI al final si reúnes pescados de estaciones distintas',
  'shop-fire-tower': 'sube 1 espacio tu Extinción de Incendios, que te protege cuando haya fuego',
  'shop-tobacco': 'compra una Pipa (efecto inmediato) y/o una Bolsa de Tabaco (puntúa al final)',
  'shop-pawn': 'entrega 1 arroz o 1 sandalia y cobra 4 mons',
  'shop-construction': 'cambia 1 mon por 1 de arroz, o construye un edificio pagando 1 mon más',
};

// --- Pasos ------------------------------------------------------------------------------------------

const ack = (id) => (g, acked) => acked.has(id);
const waiting = (g) => isAiTurn(g);

export const STEPS = [
  {
    id: 'welcome', kind: 'info', title: 'Bienvenido a Edo', done: ack('welcome'),
    text: (g) => `<p>Vas a jugar <b>un mes completo</b> de IKI como ${who(g, humanOf(g))}, contra dos jugadores de IA.</p>
      <p>El objetivo del juego es acabar el año con más <b>IKI</b> (puntos). Se consigue contratando artesanos y comerciantes,
      haciéndolos trabajar y retirándolos cuando acumulan experiencia.</p>
      <p>Cuando haya que actuar, esta burbuja te dirá qué hacer y lo marcará en pantalla.</p>`,
  },
  {
    id: 'street', kind: 'info', title: 'La calle principal', done: ack('street'),
    spots: () => STREET,
    text: () => `<p>Esta es la calle de Nihonbashi: un circuito de 8 casillas que se recorre en el sentido de las flechas.</p>
      <p>Cada casilla tiene una <b>tienda</b> (el pergamino de su lado) y dos <b>puestos</b>: los solares que hay detrás.
      Tu peón, el <b>Oyakata</b>, recorre la calle y en cada parada puedes usar la tienda y un personaje de sus puestos.</p>`,
  },
  {
    id: 'lots', kind: 'info', title: 'Los solares', done: ack('lots'),
    spots: () => LOT_IDS,
    text: () => `<p>Detrás de la calle hay 16 <b>solares</b>, en cuatro manzanas (Nagayas). Ahí colocas personajes y edificios.
      Los que tocan el cruce central cuestan 2 mons más.</p>
      <p>Cada personaje lleva encima uno de tus <b>Kobun</b> (tus obreros; empiezas con 4). Cuanto más trabaja el personaje,
      más sube su Kobun por la carta y mejor es su salario.</p>`,
  },
  {
    id: 'you', kind: 'info', title: 'Tus recursos', done: ack('you'),
    focus: (g) => [`.seat[data-player="${humanOf(g)}"]`],
    text: (g, { mobile } = {}) => `<p>Esta es tu ficha, ${mobile ? 'en el panel <b>Jugadores</b> (botón «Jugad.» de la barra)' : 'a la derecha'}.
      Empiezas con <b>8 mons</b> (el dinero), <b>1 de arroz</b> (para alimentar a tus personajes) y <b>1 sandalia</b> (te deja
      avanzar un paso más). También tienes 4 Kobun libres y 0 IKI.</p>
      <p>Pulsa «Tablero» en tu ficha cuando quieras ver tu tablero entero.</p>`,
  },
  {
    id: 'initial', kind: 'action', title: 'Tu personaje inicial', done: (g) => g.phase !== 'initial-characters',
    allow: (g, a) => a.type === 'placeInitial',
    zones: () => null,
    focus: () => ['.initial-cards'],
    text: (g, { mobile } = {}) => `<p>Los otros dos jugadores ya han colocado el suyo. <b>Elige una carta</b> ${mobile
      ? 'del panel <b>Mesa</b> (al tocarla se ve en grande: pulsa «Elegir»)'
      : 'de la izquierda (pasa el ratón para verla grande)'} y después pulsa un <b>solar exterior libre</b> del tablero.</p>
      <ul>${g.initialCharacters.map((id) => `<li><b>${cardName(id)}</b>: ${abilityText(CHARACTERS_BY_ID[id])}</li>`).join('')}</ul>`,
  },
  {
    id: 'placed', kind: 'info', title: 'Tu primer personaje', done: ack('placed'),
    spots: (g) => { const h = home(g); return [h.lot, h.cell]; },
    text: (g) => {
      const h = home(g);
      const def = CHARACTERS_BY_ID[h.card];
      return `<p><b>${def.name}</b> (${typeLabel(def.type)}) ya trabaja para ti, con un Kobun en el primer espacio de experiencia.</p>
        <p>Su solar es un puesto de la casilla <b>${cellName(h.cell)}</b>: cuando tu Oyakata pare ahí podrás activarlo (${abilityText(def)}).
        Cada Día de Pago, que llega cada tres meses, cobrará el salario de la casilla donde esté su Kobun.</p>`;
    },
  },
  {
    id: 'month', kind: 'info', title: 'Empieza el mes 1', done: ack('month'),
    spots: () => ['month-1'],
    focus: () => ['.row-cards'],
    text: (g, { mobile } = {}) => `<p>El calendario marca el <b>mes 1</b> (Primavera). Cada mes tiene tres fases:</p>
      <ul><li><b>A · Camino de la vida:</b> decides el orden de juego y cuánto te moverás.</li>
      <li><b>B · Acciones:</b> el turno de cada jugador.</li>
      <li><b>C · Evento:</b> cierra el mes.</li></ul>
      <p>${mobile ? 'En el panel <b>Mesa</b> (botón de la barra de la izquierda)' : 'A la izquierda'} están las 4 cartas del mes, que
      podrás contratar; el coste va impreso en cada una.</p>`,
  },
  {
    id: 'ikizama', kind: 'action', title: 'A · Coloca tu Ikizama', done: (g) => g.month > 1 || g.phase !== 'ikizama',
    allow: (g, a) => a.type === 'placeIkizama' && a.slot !== '1-4',
    deny: (g, a) => (a.type === 'placeIkizama' ? 'En el tutorial elige un espacio del 1 al 4.' : null),
    zones: () => ['turn-1', 'turn-2', 'turn-3', 'turn-4'],
    text: (g) => {
      if (waiting(g)) return '<p>Los demás jugadores colocan su Ikizama…</p>';
      const h = home(g);
      const need = stepsBetween(player(g).oyakata, h.cell);
      const tip = need >= 1 && need <= 4
        ? `Tu personaje está en <b>${cellName(h.cell)}</b>, a ${need} casilla(s) de tu Oyakata: el espacio <b>${need}</b> te llevaría justo a sus puestos.`
        : `Tu personaje está en <b>${cellName(h.cell)}</b>, lejos de tu Oyakata: con las sandalias podrías acercarte.`;
      return `<p>Pulsa un espacio del marcador de turno, abajo a la derecha del tablero, para colocar tu <b>Ikizama</b> (el peón alargado).
        Decide dos cosas: <b>el orden</b> (el de la izquierda juega primero) y <b>cuántas casillas</b> avanzas este mes (1, 2, 3 o 4).</p>
        <p>${tip}</p><p class="muted">El espacio «1-4», que da libertad pero renuncia a las acciones, lo verás en una partida real.</p>`;
    },
  },
  {
    id: 'phase-b', kind: 'info', title: 'B · Acciones', done: ack('phase-b'),
    spots: () => ['turn-1', 'turn-2', 'turn-3', 'turn-4'],
    text: (g) => `<p>Todos han colocado su Ikizama. Ahora juega cada uno su turno, de izquierda a derecha en el marcador; empieza
      ${who(g, g.turnList[0])}. Las IA juegan solas.</p>
      <p>Un turno tiene tres partes: <b>B1</b>, elegir entre ingresos o contratar; <b>B2</b>, mover el Oyakata y hacer negocios;
      y <b>B3</b>, terminar.</p>`,
  },
  {
    id: 'b1', kind: 'action', title: 'B1 · Ingresos o contratar', done: (g) => !['before', 'b1'].includes(progress(g)),
    allow: (g, a) => ['income', 'hire'].includes(a.type),
    zones: () => null,
    focus: () => ['[data-do="income"]', '.row-cards'],
    text: (g, { mobile } = {}) => {
      if (progress(g) === 'before') return '<p>Esperando a que terminen los turnos anteriores… Mira el registro para ver qué hacen.</p>';
      const options = hireable(g);
      const dest = destination(g);
      const tip = options.length
        ? `<p>Con tus mons puedes contratar a ${options.map((r) => `<b>${cardName(r.card)}</b>`).join(', ')}.
          ${dest ? `Si lo pones en un puesto de <b>${cellName(dest)}</b>, que es donde vas a llegar, podrás activarlo este mismo turno.` : ''}</p>`
        : '<p>No puedes contratar a nadie ahora: elige <b>Ingresos</b>.</p>';
      return `<p>Es tu turno. Elige <b>una</b> opción:</p>
        <ul><li><b>Ingresos:</b> cobras 4 mons sin más.</li>
        <li><b>Contratar:</b> ${mobile ? 'pulsa «Ver la fila de personajes», toca una carta, pulsa «Elegir»' : 'pulsa una carta de la fila'} y luego un solar libre. Pagas su coste en mons (los que tenga encima son para ti)
        y gastas un Kobun. Algunos personajes también suben tu Extinción de Incendios.</li></ul>${tip}`;
    },
  },
  {
    id: 'move', kind: 'action', title: 'B2 · Mueve tu Oyakata', done: (g) => !['before', 'b1', 'move'].includes(progress(g)),
    allow: (g, a) => a.type === 'move',
    zones: () => [],
    spots: (g) => [home(g).cell],
    focus: () => ['[data-do="move"]'],
    text: (g) => {
      const h = home(g);
      const slot = Number(g.turn.slot);
      const sandals = player(g).resources.sandal;
      const need = stepsBetween(player(g).oyakata, h.cell);
      const reach = slot === need ? `Con tus ${slot} paso(s) llegas justo a sus puestos.`
        : slot > need ? `Con ${slot} pasos te pasas de sus puestos: este turno no podrás activarlo, pero sí usar la tienda de donde pares.`
        : slot + sandals >= need ? `Te faltan ${need - slot} paso(s): gasta sandalias con «+» para llegar.`
        : 'No llegas a sus puestos este turno; no pasa nada, aprovecha la tienda de donde pares.';
      return `<p>Tu Ikizama marca <b>${slot}</b>: tu Oyakata avanza ${slot} casilla(s) siguiendo las flechas. Cada <b>sandalia</b> que gastes
        añade un paso más (tienes ${sandals}).</p>
        <p>Tu personaje trabaja en <b>${cellName(h.cell)}</b> (marcada en el tablero). ${reach}</p>
        <p class="muted">Al cruzar la casilla de vuelta, todos tus personajes ganan 1 de experiencia.</p>
        <p>Ajusta las sandalias en el panel y pulsa <b>Mover</b>.</p>`;
    },
  },
  {
    id: 'business', kind: 'action', title: 'B2 · Negocios', done: (g) => progress(g) === 'after',
    allow: (g, a) => ['shop', 'character', 'endTurn'].includes(a.type),
    zones: () => null,
    spots: (g) => [player(g).oyakata],
    focus: () => ['.turn-body .biz'],
    text: (g) => {
      const here = ZONES_BY_ID[player(g).oyakata];
      const { didShop, didChar } = g.turn;
      const stalls = here.stalls.filter((l) => g.lots[l]?.kind === 'character').map((l) => {
        const lot = g.lots[l];
        return `<li><b>${cardName(lot.card)}</b>, ${lot.owner === humanOf(g) ? 'tuyo' : `de ${who(g, lot.owner)}`}</li>`;
      });
      const foreign = here.stalls.some((l) => g.lots[l]?.kind === 'character' && g.lots[l].owner !== humanOf(g));
      const shop = didShop ? 'La tienda ya está usada.' : `Tienda: ${SHOP_HELP[here.shop]}.`;
      const people = didChar ? 'Ya has activado un personaje.' : stalls.length ? 'Personajes en los puestos:' : 'No hay personajes en los puestos.';
      return `<p>Has llegado a <b>${cellName(player(g).oyakata)}</b>. Aquí puedes hacer <b>dos cosas</b>, en el orden que quieras y sin
        obligación: usar la <b>tienda</b> y activar <b>un personaje</b> de los puestos.</p>
        <p>${shop}</p><p>${people}</p>${!didChar && stalls.length ? `<ul>${stalls.join('')}</ul>` : ''}
        ${foreign && !didChar ? '<p class="muted">Si activas el de otro jugador, funciona igual para ti, pero su dueño gana 1 de experiencia.</p>' : ''}
        <p>Cuando termines, pulsa <b>Terminar turno</b> (B3).</p>`;
    },
  },
  {
    id: 'others', kind: 'wait', title: 'Turno de los demás', done: (g) => g.month > 1,
    text: () => `<p>Has terminado tu turno: tu Ikizama vuelve a tu tablero. Mira el <b>registro</b> del panel mientras juegan los demás.
      Cuando acaben, se resuelve el Evento del mes.</p>`,
  },
  {
    id: 'event', kind: 'info', title: 'C · Evento', done: ack('event'),
    spots: () => ['month-2'],
    text: () => `<p>Se acabó el mes 1. En su Evento solo se ha añadido <b>1 mon</b> sobre cada carta de la fila que nadie contrató, para animar
      a que alguien lo haga: quien la contrate se queda esos mons.</p>
      <p>Los Eventos importantes llegan más adelante: el <b>Día de Pago</b> (meses 3, 6, 9 y 12), con salarios, bonificación por Armonía y
      arroz para tus personajes; y los <b>Incendios</b> (meses 5, 8 y 11), que queman solares si tu Extinción de Incendios no llega.</p>`,
  },
  {
    id: 'end', kind: 'info', title: 'Mes completado', done: () => false, last: true,
    text: () => `<p>Ya conoces el ciclo: Ikizama, Acciones y Evento. Se repite hasta el mes 12; el 13 es el Día de Año Nuevo y después se cuenta
      el IKI de cada uno.</p>
      <p>Puedes <b>seguir jugando esta partida</b> desde el mes 2 o volver al menú.</p>`,
  },
];

/** Paso en curso: el primero que aún no está superado. */
export const currentStep = (g, acked) => STEPS.find((s) => !s.done(g, acked));

/** ¿Acepta el paso `step` esta jugada del humano? */
export const stepAllows = (step, g, action) => step.kind === 'action' && step.allow(g, action);

/** Zonas pulsables en este paso: null = las que ofrezca el panel. */
export const stepZones = (step, g) => (step.kind === 'action' ? step.zones?.(g) ?? null : []);
