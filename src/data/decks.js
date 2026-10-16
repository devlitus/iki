/**
 * Mazos de Personaje por estación y cartas de Edificio (ver docs/reglas.md, preparación pasos 6 y 8).
 * Los ids coinciden con los escaneos de public/cards/<estación>/<id>.jpg. Invierno aún no tiene escaneos.
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
    id: 'winter', name: 'Invierno', back: null,
    cards: ['charcoal-seller', 'chili-seller', 'candy-seller', 'candy-maker', 'fan-maker', 'glass-blower', 'brush-maker',
      'kabuki-actor', 'samurai', 'sumo-wrestler', 'buddhist-sculptor', 'karuta-maker', 'stone-carver', 'incense-shop'],
  },
];

export const SEASONS_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

/** Imagen de una carta de estación, o null si aún no está escaneada. */
export const seasonCardImage = (seasonId, cardId) =>
  (SEASONS_BY_ID[seasonId].back ? `/cards/${seasonId}/${cardId}.jpg` : null);

export const BUILDINGS = [
  { id: 'farm', name: 'Granja' },
  { id: 'fire-tower', name: 'Torre Antiincendios' },
  { id: 'imperial-villa', name: 'Villa Imperial' },
  { id: 'tavern', name: 'Taberna' },
  { id: 'kabuki-theater', name: 'Teatro de Kabuki' },
  { id: 'trading-house', name: 'Casa Comercial' },
  { id: 'restaurant', name: 'Restaurante' },
  { id: 'shrine', name: 'Santuario' },
  { id: 'warehouse', name: 'Almacén' },
  { id: 'well', name: 'Pozo' },
].map((b) => ({ ...b, image: `/cards/buildings/${b.id}.jpg` }));

export const BUILDINGS_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const BUILDING_BACK = '/cards/buildings/building-back.jpg';
