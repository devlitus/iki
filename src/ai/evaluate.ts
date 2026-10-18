import { CHARACTERS_BY_ID } from '../data/characters.ts';
import { ZONES_BY_ID } from '../data/zones.ts';
import { scorePlayer } from '../game/scoring.ts';
import { PAYDAY_MONTHS, FIRE_STRENGTH, harmonyGains } from '../game/events.ts';
import { characterLots, salaryOf } from '../game/state.ts';
import type { Amount, Character, Game, Res } from '../types.ts';

type Weights = Partial<Record<Res, number>>;

/**
 * Valoración de una posición para la IA, en puntos de IKI "esperados". Se apoya en la puntuación final real
 * (scoring.js) y le suma lo que aún no puntúa pero acabará valiendo: recursos, personajes con su habilidad y su
 * salario, fichas especiales, Extinción de Incendios y la Armonía de los próximos Días de Pago.
 */

// Lo que vale cada recurso a mitad de partida (sirve para comprar, contratar y pagar) y lo que vale al final.
const MID: Record<Res, number> = { mon: 0.5, rice: 1.1, sandal: 0.7, wood: 1.2, koban: 3.2, iki: 1 };
const END: Record<Res, number> = { mon: 0.25, rice: 0, sandal: 0, wood: 1, koban: 3, iki: 1 };

const SPECIAL_VALUE = 1.5;
const FIRE_LEVEL_VALUE = 1;
const CHARACTER_BASE = 2.5;
const OPPONENT_WEIGHT = 0.3; // cuánto pesa lo que ganan los rivales (la partida es de puntos relativos)

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Pesos de los recursos en este mes: de los de mitad de partida a los de final, a partir del mes 8. */
function weights(g: Game): Weights {
  const t = clamp((g.month - 7) / 5, 0, 1);
  return Object.fromEntries((Object.keys(MID) as Res[]).map((res) => [res, MID[res] * (1 - t) + END[res] * t]));
}

const valueOf = (list: Amount[], w: Weights) => list.reduce((sum, { res, n }) => sum + n * (w[res] ?? 0), 0);

/** Próximos Días de Pago que quedan (incluido el del mes en curso, si aún no ha pasado). */
const paydaysLeft = (g: Game) => PAYDAY_MONTHS.filter((m) => m >= g.month).length;

function abilityValue(def: Character, w: Weights, uses: number) {
  const { kind, gain, pay } = def.ability;
  const net = valueOf(gain, w) - valueOf(pay, w);
  const extra = ({ fire: FIRE_LEVEL_VALUE, xp: 1.2, build: 1.5, swap: 0.3 } as Record<string, number>)[kind] ?? 0;
  return (net + extra) * uses;
}

/** Lo que aporta un personaje que sigue en el tablero, con `xp` de experiencia. */
function characterValue(def: Character, xp: number, g: Game, w: Weights) {
  const uses = clamp((13 - g.month) / 3, 0.5, 4) * 0.5; // solo la mitad de las veces se podrá activar
  const salary = paydaysLeft(g) * valueOf(salaryOf(def, xp), w);
  const progress = (xp / def.salary.length) * 2 + (def.retireToken ? SPECIAL_VALUE : 0);
  return CHARACTER_BASE + salary + abilityValue(def, w, uses) + progress;
}

/** Un personaje retirado sigue cobrando su salario máximo en cada Día de Pago. */
const retiredValue = (def: Character, g: Game, w: Weights) => paydaysLeft(g) * valueOf(def.salary.at(-1) ?? [], w);

/** Daño esperado del próximo Incendio: cada Nagaya tiene 1/4 de arder y quemaría lo que no resista su fuerza. */
function fireRisk(g: Game, p: number) {
  const month = Object.keys(FIRE_STRENGTH).map(Number).find((m) => m >= g.month);
  if (!month) return 0;
  const fire = g.players[p].fire;
  let loss = 0;
  for (const [lotId, lot] of Object.entries(g.lots)) {
    if (lot.owner !== p) continue;
    if (fire < FIRE_STRENGTH[month] + ZONES_BY_ID[lotId].fire!) loss += lot.kind === 'building' ? 6 : 4;
  }
  return loss * 0.25;
}

/** Valor de la posición de `p`, en puntos de IKI. */
export function evaluate(g: Game, p: number): number {
  const player = g.players[p];
  const w = weights(g);
  const score = scorePlayer(g, p);
  let v = score.track + score.variety + score.fish + score.tobacco + score.buildings;

  v += valueOf(Object.entries(player.resources).map(([res, n]) => ({ res: res as Res, n })), w);
  v += player.specials.length * SPECIAL_VALUE;
  v += player.fire * FIRE_LEVEL_VALUE;

  const lots = characterLots(g, p);
  for (const lotId of lots) v += characterValue(CHARACTERS_BY_ID[g.lots[lotId].card], g.lots[lotId].xp, g, w);
  for (const card of player.retired) v += retiredValue(CHARACTERS_BY_ID[card], g, w);
  v += player.kobun * 0.6;

  // Comida del próximo Día de Pago: cada personaje sin arroz se pierde.
  v -= Math.max(0, lots.length - player.resources.rice) * 2.5;
  v += harmonyGains(g)[p] * paydaysLeft(g);
  v -= fireRisk(g, p);
  return v;
}

/** Valor para `p` frente a los demás: lo que ganan los rivales también le cuenta (un poco) en contra. */
export function evaluateAgainstOthers(g: Game, p: number): number {

  const others = g.players.map((_, q) => q).filter((q) => q !== p);
  const rivals = others.reduce((sum, q) => sum + evaluate(g, q), 0) / others.length;
  return evaluate(g, p) - OPPONENT_WEIGHT * rivals;
}
