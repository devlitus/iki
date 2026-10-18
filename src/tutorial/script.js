import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { ZONES_BY_ID, STREET, STREET_ENTRY, LOT_IDS, NAGAYAS } from '../data/zones.ts';
import { tryAct } from '../game/engine.ts';
import { FIRE_STRENGTH, PAYDAY_MONTHS } from '../game/events.ts';
import { seasonOf } from '../game/month.ts';
import { characterLots } from '../game/state.ts';
import { isAiTurn } from '../ai/player.js';
import { EVENT_LOG_TYPES, abilityText, cardName, logLine, shopName, typeLabel, who } from '../view/format.js';

/**
 * Guion del tutorial: un año completo jugado por el humano contra dos IA. El mes 1 va paso a paso (fases A, B y C); del
 * mes 2 al 13 se juega libre y el guion avisa antes de cada Día de Pago, Incendio y cambio de estación, y cuenta después
 * qué pasó. Es solo datos y funciones puras sobre el estado de la partida; la burbuja y los resaltados los pinta tutorial.js.
 *
 * Cada paso:
 *   kind    'info'   explica y espera a «Siguiente» (mientras tanto las IA no juegan)
 *           'action' pide una jugada del humano; `allow` dice cuáles acepta
 *           'wait'   espera a que terminen los demás
 *           'free'   juego libre: acepta cualquier jugada y solo recuerda qué toca
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

// --- Del mes 2 en adelante ---------------------------------------------------------------------------

/** Aviso del mes `month`: superado al leerlo o, si se pasó de largo, cuando ya va el mes siguiente. */
const seen = (id, month) => (g, acked) => acked.has(id) || g.month > month || g.phase === 'ended';

/** Marcas del marcador de Extinción de Incendios: donde están las fichas de todos. */
const fireSpots = (g) => [...new Set(g.players.map((p) => `fire-${p.fire}`))];

/** Qué cierra el mes `month`. */
function monthEnd(month) {
  if (PAYDAY_MONTHS.includes(month)) return `el <b>Día de Pago</b>${month < 12 ? ' y el cambio de estación' : ''}`;
  if (FIRE_STRENGTH[month]) return `un <b>Incendio de fuerza ${FIRE_STRENGTH[month]}</b>`;
  return month === 13 ? 'el final de la partida' : 'solo 1 mon más en cada carta de la fila';
}

/** Recordatorio de lo que toca ahora en el juego libre. */
function nowText(g) {
  const h = humanOf(g);
  const pending = g.pending?.player === h ? g.pending.type : null;
  if (pending === 'food') return `No tienes arroz para todos: elige <b>${g.pending.drop}</b> personaje(s) que se quedan sin comer y se van.`;
  if (pending === 'avoidFire') return 'El fuego va a quemar uno de tus personajes: puedes gastar tu ficha <b>Evitar un incendio</b> para salvarlo.';
  if (pending === 'wildType') return 'Elige de qué tipo cuenta tu <b>Marionetista</b> para la Variedad.';
  if (waiting(g)) return 'Juegan los demás… Lo que hacen queda en el registro.';
  if (g.phase === 'ikizama') return 'Coloca tu <b>Ikizama</b>: el número es tu orden en la fase B y cuántas casillas avanzas. El «1-4» juega el primero y eliges de 1 a 4 pasos, pero sin B1 (ganas 1 mon).';
  const step = g.turn?.step;
  if (step === 'b1') return '<b>B1:</b> cobra <b>Ingresos</b> (4 mons) o <b>contrata</b> una carta de la fila.';
  if (step === 'move') return '<b>B2:</b> mueve tu Oyakata; cada sandalia que gastes añade un paso.';
  if (step === 'place') return 'Coloca tu Oyakata <b>en cualquier casilla</b> de la calle.';
  if (step === 'business') return '<b>B2:</b> usa la tienda y activa un personaje de los puestos si te conviene; luego <b>Terminar turno</b>.';
  return '';
}

/** Juego libre del mes `month` (en el 13, hasta que acaba la partida). */
const play = (month) => ({
  id: `play-${month}`, kind: 'free', done: (g) => g.phase === 'ended' || (month < 13 && g.month > month),
  title: month === 13 ? 'Mes 13 · Año Nuevo' : `Mes ${month} · ${seasonOf(month).name}`,
  text: (g) => `<p>${nowText(g)}</p><p class="muted">Al final de este mes: ${monthEnd(month)}.</p>`,
});

/** Arroz que tiene el humano frente a los personajes que tendrá que alimentar. */
function riceTip(g) {
  const rice = player(g).resources.rice;
  const mouths = characterLots(g, humanOf(g)).length;
  if (rice >= mouths) return `Tienes <b>${rice}</b> de arroz para <b>${mouths}</b> personaje(s): de momento, comen todos.`;
  return `Tienes <b>${rice}</b> de arroz y <b>${mouths}</b> personajes: te faltan ${mouths - rice}. Consíguelo en la <b>Tienda de Arroz</b>
    o el <b>Lugar de Construcción</b> (marcados) antes de que acabe el mes.`;
}

/** Lo que pasó en el Evento del mes `month`, contado como lista (el humano y el fuego, que afecta a todos). */
function recap(g, month) {
  const h = humanOf(g);
  const lines = g.log.filter((e) => e.month === month && EVENT_LOG_TYPES.includes(e.type) && (e.player === h || e.type.startsWith('fire')));
  return lines.length ? `<ul>${lines.map((e) => `<li>${logLine(g, e)}</li>`).join('')}</ul>` : '<p class="muted">No te ha afectado.</p>';
}
const recapLine = (g, month) => {
  const salary = g.log.find((e) => e.month === month && e.type === 'salary' && e.player === humanOf(g));
  return salary ? `En el último Día de Pago: ${logLine(g, salary)}. ` : '';
};

/** Aviso al empezar un mes de Incendio: qué fuerza tendría el fuego en cada solar del humano. */
const fireSoon = (month) => ({
  id: `fire-soon-${month}`, kind: 'info', title: `Incendio al final del mes ${month}`, done: seen(`fire-soon-${month}`, month),
  spots: (g) => [...fireSpots(g), 'shop-fire-tower'],
  text: (g) => {
    const h = humanOf(g);
    const level = player(g).fire;
    const strength = FIRE_STRENGTH[month];
    const mine = Object.keys(g.lots).filter((id) => g.lots[id].owner === h).map((id) => {
      const need = strength + ZONES_BY_ID[id].fire;
      return `<li><b>${cardName(g.lots[id].card)}</b>: el fuego llegaría con fuerza ${need}, ${level >= need ? 'tu nivel lo apaga' : '<b>arde</b> si llega'}.</li>`;
    });
    return `<p>Este mes acaba con un <b>Incendio de fuerza ${strength}</b> en un Nagaya al azar. Tu Extinción de Incendios está en <b>${level}</b>.</p>
      ${mine.length ? `<ul>${mine.join('')}</ul>` : '<p>No tienes cartas en el tablero que puedan arder.</p>'}
      <p>Recuerda: cada solar desde el exterior le resta 1 de fuerza, y una carta tuya que lo apague salva las de detrás.
      ${level < 10 ? 'Aún puedes subir tu nivel en la <b>Torre de Incendios</b> (marcada).' : ''}</p>`;
  },
});

/** Lo que hizo el Incendio del mes `month`, al empezar el siguiente. */
const fireDone = (month) => ({
  id: `fire-done-${month}`, kind: 'info', title: 'Así fue el Incendio', done: seen(`fire-done-${month}`, month + 1),
  text: (g) => `${recap(g, month)}<p>${month < 11
    ? `El próximo Incendio, al final del mes ${month + 3}, será más fuerte (${FIRE_STRENGTH[month + 3]}).`
    : 'Era el último Incendio del año.'} Recuerda que tu Extinción también decide el orden para colocar el Ikizama.</p>`,
});

/** Aviso al empezar un mes de Día de Pago (el del mes 3 se explica entero en su propio paso). */
const paydaySoon = (month) => ({
  id: `payday-soon-${month}`, kind: 'info', title: `Día de Pago al final del mes ${month}`, done: seen(`payday-soon-${month}`, month),
  spots: () => [`month-${month}`, 'shop-rice', 'shop-construction'],
  text: (g) => `<p>Este mes cierra la estación con un <b>Día de Pago</b>: salario, Armonía y comida.</p><p>${riceTip(g)}</p>`,
});

/** Lo que dio el Día de Pago y la estación que empieza. */
const paydayDone = (month, season, name) => ({
  id: `payday-done-${month}`, kind: 'info', title: `Empieza el ${name}`, done: seen(`payday-done-${month}`, month + 1),
  spots: () => [`season-${season}`],
  focus: () => ['.row-cards'],
  text: (g) => `<p>Así fue el Día de Pago:</p>${recap(g, month)}
    <p>Empieza el <b>${name}</b>: nuevas cartas en la fila y nuevo Pescado, Pipas y Tabaco. Recuerda comprar un pescado esta estación si quieres variedad.</p>`,
});

export const STEPS = [
  {
    id: 'welcome', kind: 'info', title: 'Bienvenido a Edo', done: ack('welcome'),
    text: (g) => `<p>Vas a jugar <b>un año completo</b> de IKI como ${who(g, humanOf(g))}, contra dos jugadores de IA. El primer mes, paso a paso;
      después juegas tú y te aviso de lo importante: el Día de Pago, los Incendios y los cambios de estación.</p>
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
    id: 'event', kind: 'info', title: 'C · Evento', done: (g, acked) => acked.has('event') || g.month > 2,
    spots: () => ['month-2'],
    text: () => `<p>Se acabó el mes 1. En su Evento solo se ha añadido <b>1 mon</b> sobre cada carta de la fila que nadie contrató, para animar
      a que alguien lo haga: quien la contrate se queda esos mons.</p>
      <p>Los Eventos importantes llegan más adelante: el <b>Día de Pago</b> (meses 3, 6, 9 y 12) y los <b>Incendios</b> (meses 5, 8 y 11).
      Te avisaré antes de cada uno.</p>`,
  },
  {
    id: 'on-your-own', kind: 'info', title: 'Ahora juegas tú', done: seen('on-your-own', 2),
    spots: (g) => fireSpots(g),
    text: (g) => `<p>Ya conoces el ciclo de un mes. A partir de ahora juegas libremente; la burbuja te recordará qué toca y te
      avisará antes de cada Evento.</p>
      <p>Una novedad desde el mes 2: el Ikizama se coloca por orden del marcador de <b>Extinción de Incendios</b> (abajo a la
      izquierda, marcado): empieza quien esté más adelantado. Tú estás en el <b>${player(g).fire}</b>. Este marcador es tu
      protección contra el fuego, ya verás para qué.</p>`,
  },
  play(2),
  {
    id: 'payday-soon', kind: 'info', title: 'Llega el Día de Pago', done: seen('payday-soon', 3),
    spots: () => ['month-3', 'shop-rice', 'shop-construction'],
    text: (g) => `<p>Al final de este mes, el último de la Primavera, llega el primer <b>Día de Pago</b>. Ocurre en tres pasos:</p>
      <ul><li><b>Salario:</b> cada personaje te paga lo que marca la casilla donde está su Kobun (y los retirados, el más alto).</li>
      <li><b>Armonía:</b> en cada Nagaya con al menos 2 personajes del mismo tipo, ganas IKI: los tuyos de ese tipo × todos los de ese tipo.</li>
      <li><b>Comida:</b> pagas <b>1 arroz por cada personaje</b> tuyo en el tablero; el que no comas, se va.</li></ul>
      <p>${riceTip(g)}</p>`,
  },
  play(3),
  {
    id: 'payday-done', kind: 'info', title: 'Así fue el Día de Pago', done: seen('payday-done', 4),
    text: (g) => `<p>Esto te ha dado el Día de Pago del mes 3:</p>${recap(g, 3)}
      <p>El salario mejora cuanto más trabaja un personaje: su Kobun sube por la carta cada vez que lo activas (tú o los demás)
      y cuando das la vuelta a la calle.</p>`,
  },
  {
    id: 'season', kind: 'info', title: 'Cambio de estación', done: seen('season', 4),
    spots: () => ['season-summer', 'fish-1', 'fish-2', 'pipe-1', 'pipe-2', 'pipe-3', 'pipe-4'],
    focus: () => ['.row-cards'],
    text: (g, { mobile } = {}) => `<p>Con el Día de Pago terminó la Primavera: empieza el <b>Verano</b> (meses 4 a 6). Cada cambio de estación:</p>
      <ul><li>Las cartas de Primavera que nadie contrató <b>se retiran</b>; desde ahora la fila ${mobile ? '(panel Mesa)' : ''} sale del mazo de Verano.</li>
      <li>El <b>Pescado</b>, las <b>Pipas</b> y las <b>Bolsas de Tabaco</b> que quedaban se cambian por las de la nueva estación (marcadas).</li></ul>
      <p>Solo puedes comprar <b>un pescado por estación</b>, y al final dan más IKI cuantos más tengas de estaciones distintas
      (3, 6, 10 o 15): lo que no compres en una estación, ya no vuelve.</p>`,
  },
  {
    id: 'fire-intro', kind: 'info', title: 'El fuego de Edo', done: seen('fire-intro', 4),
    spots: (g) => [...fireSpots(g), 'fire-tiles', 'shop-fire-tower', ...NAGAYAS.map((n) => n.lots[0])],
    text: () => `<p>Edo era una ciudad de madera: al final de los meses <b>5, 8 y 11</b> hay un <b>Incendio</b>, cada vez más fuerte
      (fuerza <b>5, 8 y 10</b>).</p>
      <ul><li>Se roba una loseta (marcada) que dice qué <b>Nagaya</b> arde. El fuego empieza en su solar exterior (marcados) y avanza hacia el cruce.</li>
      <li>Por cada solar que avanza pierde 1 de fuerza; los solares vacíos solo lo dejan pasar.</li>
      <li>Al llegar a una carta, si su dueño tiene <b>Extinción de Incendios</b> igual o mayor que la fuerza, lo apaga ahí (y salva lo que hay detrás).
      Si no, la carta <b>arde</b> (vuelve su Kobun) y el fuego sigue.</li></ul>
      <p>Sube tu Extinción en la <b>Torre de Incendios</b> (marcada) o contratando personajes con poder antiincendios. Tienes un mes para prepararte.</p>`,
  },
  play(4),
  fireSoon(5),
  play(5),
  fireDone(5),
  paydaySoon(6),
  play(6),
  paydayDone(6, 'autumn', 'Otoño'),
  play(7),
  fireSoon(8),
  play(8),
  fireDone(8),
  paydaySoon(9),
  play(9),
  paydayDone(9, 'winter', 'Invierno'),
  play(10),
  fireSoon(11),
  play(11),
  fireDone(11),
  {
    id: 'payday-12', kind: 'info', title: 'El último Día de Pago', done: seen('payday-12', 12),
    spots: () => ['month-12', 'month-13'],
    text: (g) => `<p>Último mes del año. Al acabar, el último <b>Día de Pago</b>: ${riceTip(g)}</p>
      <p>Después todos recogen su Oyakata y llega el <b>Día de Año Nuevo</b>, una ronda especial que cierra la partida.</p>`,
  },
  play(12),
  {
    id: 'newyear', kind: 'info', title: 'Día de Año Nuevo', done: (g, acked) => acked.has('newyear') || g.phase === 'ended',
    spots: () => ['month-13'],
    text: (g) => `<p>${recapLine(g, 12)}Llega el <b>mes 13</b>, el Día de Año Nuevo. Es distinto:</p>
      <ul><li>No hay Ikizama ni B1: cada uno juega una vez, por orden de Extinción de Incendios.</li>
      <li>Colocas tu Oyakata <b>en cualquier casilla</b> de la calle y haces negocios allí: la tienda y un personaje.</li></ul>
      <p>Piensa dónde rinde más: un personaje a punto de retirarse, el último pescado o una bolsa de Tabaco.</p>`,
  },
  play(13),
  {
    id: 'end', kind: 'info', title: 'Fin del año', done: () => false, last: true,
    text: () => `<p>Has jugado un año entero en Edo. Al IKI ganado durante la partida se suma:</p>
      <ul><li><b>Variedad:</b> según los tipos de personaje distintos que contrataste (1, 4, 9, 16 o 25).</li>
      <li><b>Pescado</b> de estaciones distintas, <b>Bolsas de Tabaco</b> (dobles si tienes una Pipa) y <b>Edificios</b>.</li>
      <li><b>Recursos:</b> cada Koban vale 3 y cada 4 mons, 1. El arroz y las sandalias no valen nada.</li></ul>
      <p>La tabla final cuenta cuánto sacó cada uno. Ya estás listo para una partida de verdad.</p>`,
  },
];

/**
 * Avisos sueltos: salen una vez, en cuanto se cumple `when`, antes que el paso en curso (no tienen un sitio fijo en el
 * guion porque pueden pasar en cualquier mes).
 */
export const TIPS = [
  {
    id: 'tip-retire', kind: 'info', title: 'Un personaje se retira', when: (g) => player(g).retired.length > 0,
    focus: (g) => [`.seat[data-player="${humanOf(g)}"]`],
    text: (g) => `<p><b>${cardName(player(g).retired[0])}</b> ha llegado al final de su carta y <b>se retira</b>: pasa a tu tablero de jugador
      y su Kobun vuelve a estar libre para contratar a otro.</p>
      <p>Los retirados ya no comen arroz y cada Día de Pago te siguen dando su <b>salario más alto</b>.</p>`,
  },
];

/** Paso en curso: un aviso suelto pendiente o, si no, el primer paso que aún no está superado. */
export const currentStep = (g, acked) => (g.month > 1 && TIPS.find((t) => !acked.has(t.id) && t.when(g)))
  || STEPS.find((s) => !s.done(g, acked));

/** ¿Acepta el paso `step` esta jugada del humano? En el juego libre, cualquiera. */
export const stepAllows = (step, g, action) => step.kind === 'free' || (step.kind === 'action' && step.allow(g, action));

/** Zonas pulsables en este paso: null = las que ofrezca el panel. */
export const stepZones = (step, g) => (step.kind === 'action' ? step.zones?.(g) ?? null : step.kind === 'free' ? null : []);
