/**
 * Mazos de Personaje por estación y cartas de Edificio (ver docs/reglas.md, preparación pasos 6 y 8).
 * Los ids coinciden con los escaneos de public/cards/<estación>/<id>.jpg.
 */

export const SEASONS = [
  {
    id: 'spring', name: 'Primavera', back: '/cards/spring/spring-back.jpg',
    cards: ['book-seller', 'sake-seller', 'soap-bubble-maker', 'dice-maker', 'sandal-maker', 'seamstress', 'ukiyoe-artist',
      'monk', 'ox-cart', 'yamabushi', 'carpenter', 'kite-maker', 'dyer', 'soba-stall'],
  },
  {
    id: 'summer', name: 'Verano', back: '/cards/summer/summer-back.jpg',
    cards: ['dumpling-seller', 'used-clothes-seller', 'water-carrier', 'watermelon-seller', 'engraver', 'lantern-maker',
      'umbrella-maker', 'day-laborer', 'firefighter', 'temple-maid', 'fireworks-maker', 'plasterer', 'eel-stall', 'greengrocer'],
  },
  {
    id: 'autumn', name: 'Otoño', back: '/cards/autumn/autumn-back.jpg',
    cards: ['firewood-seller', 'fish-seller', 'mask-seller', 'clockmaker', 'barber', 'printer', 'shamisen-player',
      'construction-worker', 'puppeteer', 'geisha-tatsumi', 'puppet-maker', 'tatami-maker', 'sushi-stall', 'tempura-stall'],
  },
  {
    id: 'winter', name: 'Invierno', back: '/cards/winter/winter-back.jpg',
    cards: ['charcoal-seller', 'chili-seller', 'candy-seller', 'candy-maker', 'fan-maker', 'glass-blower', 'brush-maker',
      'kabuki-actor', 'samurai', 'sumo-wrestler', 'buddhist-sculptor', 'karuta-maker', 'stone-carver', 'incense-shop'],
  },
];

export const SEASONS_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

/** Imagen de una carta de estación. */
export const seasonCardImage = (seasonId, cardId) => `/cards/${seasonId}/${cardId}.jpg`;

/**
 * Edificios (Apéndice 2; costes leídos de las cartas).
 * - cost:  recursos para construirlo ({ wood, koban, rice, sandal, mon }).
 * - iki:   IKI fijo al final de la partida.
 * - score: puntuación final variable, si la tiene: 'sandal' (3 por sandalia, máx. 30), 'rice' (4 por arroz, máx. 32),
 *          'fish' (= IKI del Pescado), 'fire' (2 por espacio de Extinción).
 * - perk:  habilidad continua: 'farm' (+2 IKI por Kobun alimentado cada Día de Pago), 'fire-tower' (+3 IKI al contratar
 *          un personaje con fuego), 'imperial-villa' (+2 mons por personaje del tipo más contratado cada Día de Pago).
 */
export const BUILDINGS = [
  { id: 'farm', name: 'Granja', cost: { wood: 1, sandal: 1, mon: 2 }, iki: 2, perk: 'farm' },
  { id: 'fire-tower', name: 'Torre Antiincendios', cost: { wood: 1, rice: 1, sandal: 1 }, iki: 3, perk: 'fire-tower' },
  { id: 'imperial-villa', name: 'Villa Imperial', cost: { wood: 1, mon: 4 }, iki: 4, perk: 'imperial-villa' },
  { id: 'tavern', name: 'Taberna', cost: { wood: 1, koban: 1 }, iki: 12 },
  { id: 'kabuki-theater', name: 'Teatro de Kabuki', cost: { wood: 3, koban: 2 }, iki: 26 },
  { id: 'trading-house', name: 'Casa Comercial', cost: { wood: 2, sandal: 1, koban: 1 }, iki: 0, score: 'sandal' },
  { id: 'restaurant', name: 'Restaurante', cost: { wood: 3, rice: 2 }, iki: 0, score: 'fish' },
  { id: 'shrine', name: 'Santuario', cost: { wood: 2, koban: 2 }, iki: 22 },
  { id: 'warehouse', name: 'Almacén', cost: { wood: 1, rice: 1, koban: 1 }, iki: 0, score: 'rice' },
  { id: 'well', name: 'Pozo', cost: { wood: 4 }, iki: 0, score: 'fire' },
].map((b) => ({ ...b, image: `/cards/buildings/${b.id}.jpg` }));

export const BUILDINGS_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const BUILDING_BACK = '/cards/buildings/building-back.jpg';
