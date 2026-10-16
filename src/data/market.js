/**
 * Fichas de mercado por estación (ver docs/reglas.md, p. 5 y Apéndice 3): 2 Pescados, 2 Pipas y 2 Bolsas de Tabaco.
 * Costes y efectos leídos de las fichas de public/tokens/<estación>/.
 *
 * - cost:   mons que cuesta.
 * - Pescado: `bonus` = IKI extra del más caro de la estación (cuenta también para el Restaurante).
 * - Pipa:    `effect` inmediato al comprarla: { fire: n } | { gain: [{ res, n }] } | { xp: 1 }.
 * - Bolsa:   `score` al final (se dobla con al menos una Pipa): { iki: n } o { per: 'fire2' | 'mostType' | 'types' | 'mon4' }.
 * - image:  null si no hay escaneo (se dibuja una ficha provisional).
 */

const token = (season, kind, file, cost, extra) => ({
  id: `${season}-${file ?? `${kind}-${cost}`}`,
  season,
  kind,
  cost,
  image: file ? `/tokens/${season}/${file}.webp` : null,
  ...extra,
});

export const MARKET_TOKENS = [
  // Primavera
  token('spring', 'fish', 'fish-2', 2, { bonus: 0 }),
  token('spring', 'fish', 'fish-4', 4, { bonus: 1 }),
  token('spring', 'pipe', 'fire-2', 2, { effect: { fire: 1 } }),
  token('spring', 'pipe', 'fire-3', 3, { effect: { fire: 1 } }),
  token('spring', 'bag', 'box-2', 2, { score: { iki: 2 } }),
  token('spring', 'bag', 'box-4', 4, { score: { iki: 3 } }),
  // Verano
  token('summer', 'fish', 'fish-2', 2, { bonus: 0 }),
  token('summer', 'fish', 'fish-7', 7, { bonus: 7 }),
  token('summer', 'pipe', 'bale-2', 2, { effect: { gain: [{ res: 'rice', n: 1 }] } }),
  token('summer', 'pipe', 'sandals-3', 3, { effect: { gain: [{ res: 'sandal', n: 2 }] } }),
  token('summer', 'bag', 'bamboo-5', 5, { score: { iki: 4 } }),
  token('summer', 'bag', 'fire-5', 5, { score: { per: 'fire2' } }),
  // Otoño
  token('autumn', 'fish', 'fish-2', 2, { bonus: 0 }),
  token('autumn', 'fish', 'fish-4', 4, { bonus: 1 }),
  token('autumn', 'pipe', 'fire-2', 2, { effect: { fire: 1 } }),
  token('autumn', 'pipe', 'fire-4', 4, { effect: { fire: 2 } }),
  token('autumn', 'bag', 'inro-3', 3, { score: { per: 'mostType' } }),
  token('autumn', 'bag', 'inro-5', 5, { score: { per: 'types' } }),
  // Invierno
  token('winter', 'fish', 'fish-2', 2, { bonus: 0 }),
  token('winter', 'fish', 'fish-9', 9, { bonus: 7 }),
  token('winter', 'pipe', 'pipe-2', 2, { effect: { xp: 1 } }),
  token('winter', 'pipe', 'pipe-7', 7, { effect: { gain: [{ res: 'koban', n: 1 }] } }),
  token('winter', 'bag', 'owl-1', 1, { score: { per: 'mon4' } }),
  token('winter', 'bag', null, 5, { score: { iki: 5 }, provisional: true }), // sin foto: coste provisional
];

export const MARKET_BY_ID = Object.fromEntries(MARKET_TOKENS.map((t) => [t.id, t]));

/** Fichas de una estación, agrupadas: { fish: [id, id], pipe: [...], bag: [...] }. */
export function seasonMarket(season) {
  const out = { fish: [], pipe: [], bag: [] };
  for (const t of MARKET_TOKENS) if (t.season === season) out[t.kind].push(t.id);
  return out;
}

/** Reverso de las fichas de cada estación (boca abajo en el calendario). */
export const MARKET_BACKS = {
  spring: '/tokens/spring/back-dark.webp',
  summer: '/tokens/summer/back-dark.webp',
  autumn: '/tokens/autumn/back-dark.webp',
  winter: '/tokens/winter/back-dark.webp',
};

/** Texto corto del efecto o la puntuación de una ficha, para títulos y diálogos. */
export function describeToken(t) {
  const RES = { mon: 'mon', rice: 'arroz', sandal: 'sandalia', wood: 'madera', koban: 'Koban' };
  if (t.kind === 'fish') return `Pescado · ${t.cost} mons${t.bonus ? ` · +${t.bonus} IKI al final` : ''}`;
  if (t.kind === 'pipe') {
    const e = t.effect;
    const what = e.fire ? `+${e.fire} Extinción de Incendios`
      : e.xp ? '+1 experiencia a uno de tus personajes'
      : e.gain.map(({ res, n }) => `+${n} ${RES[res]}`).join(', ');
    return `Pipa · ${t.cost} mons · ${what}`;
  }
  const PER = { fire2: '1 IKI por cada 2 de Extinción', mostType: '1 IKI por personaje del tipo más contratado',
    types: '1 IKI por tipo de personaje distinto', mon4: '1 IKI por cada 4 mons' };
  return `Bolsa de Tabaco · ${t.cost} mons · ${t.score.iki != null ? `${t.score.iki} IKI` : PER[t.score.per]} al final`;
}
