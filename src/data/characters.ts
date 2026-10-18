/**
 * Cartas de Personaje (ver docs/reglas.md, Apéndice 1). Datos leídos de los escaneos de public/cards/.
 *
 * - cost:        coste de contratación en mons (null en las iniciales, que no se contratan).
 * - fire:        espacios que avanza el marcador de Extinción de Incendios al contratarlo.
 * - ability:     lo que hace al activarlo (ver `kind`). `pay` = lo que hay que gastar, `gain` = lo que se recibe.
 *     kind 'gain'       recibe `gain`.
 *     kind 'trade'      paga `pay` → recibe `gain`.
 *     kind 'fire'       avanza 1 espacio en Extinción de Incendios (+ `gain` si lo hay).
 *     kind 'xp'         paga `pay` → +1 de experiencia a uno de tus personajes.
 *     kind 'build'      construye un Edificio con `discount` menos de coste.
 *     kind 'swap'       cambia de posición 2 cartas de Personaje del tablero.
 *     kind 'gainOthers' recibe `gain` y cada oponente recibe `others`.
 * - salary:      una entrada por espacio de experiencia sobre el inicial; la última es el círculo (retirado).
 *                Un Kobun en el espacio k cobra salary[k]; al llegar al círculo (xp === salary.length) se retira
 *                y cobra siempre el último. Los salarios de las cartas con ficha de retiro van vacíos.
 *                Un IKI negativo se escribe con n < 0 (Jornalero).
 * - retireToken: ficha especial que da al retirarse ('hire' | 'move' | 'avoid-fire' | 'wild').
 * - scan:        carta impresa completa, limpia y ampliada (ruta en /public).
 * Recursos: mon, rice, sandal, wood, koban, iki.
 */

import type { Ability, Amount, CardSeason, Character, CharacterType, Res, Special } from '../types.ts';

export const CHARACTER_TYPES: Record<CharacterType, { label: string; color: string }> = {
  vendor: { label: 'Vendedor Ambulante', color: '#c9962b' },
  artisan: { label: 'Artesano', color: '#5c2a21' },
  special: { label: 'Especial', color: '#6b2a7a' },
  builder: { label: 'Constructor', color: '#b3262a' },
  merchant: { label: 'Comerciante', color: '#3f7fb5' },
};

const R = (res: Res) => (n = 1): Amount => ({ res, n });
const mon = R('mon');
const rice = R('rice');
const sandal = R('sandal');
const wood = R('wood');
const koban = R('koban');
const iki = R('iki');

const gain = (...g: Amount[]): Ability => ({ kind: 'gain', pay: [], gain: g });
const trade = (pay: Amount[], ...g: Amount[]): Ability => ({ kind: 'trade', pay, gain: g });
const fire = (...g: Amount[]): Ability => ({ kind: 'fire', pay: [], gain: g });
const xp = (): Ability => ({ kind: 'xp', pay: [mon()], gain: [] });
const build = (discount: Amount): Ability => ({ kind: 'build', pay: [], gain: [], discount });
const swap = (): Ability => ({ kind: 'swap', pay: [], gain: [] });
const gainOthers = (g: Amount[], others: Amount[]): Ability => ({ kind: 'gainOthers', pay: [], gain: g, others });

const SCAN_DIR: Record<CardSeason, string> = { initial: 'initial-cards', spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };

const card = (season: CardSeason, id: string, name: string, type: CharacterType, cost: number | null, hireFire: number, ability: Ability,
  salary: Amount[][], retireToken?: Special): Character => ({
  id,
  name,
  season,
  type,
  cost,
  fire: hireFire,
  ability,
  salary,
  ...(retireToken ? { retireToken } : {}),
  scan: `/cards/${SCAN_DIR[season]}/${id}.jpg`,
});

// Tres espacios de salario sin nada (cartas con ficha de retiro): dos casillas y el círculo.
const TOKEN_SALARY: Amount[][] = [[], [], []];

export const CHARACTERS: Character[] = [
  // --- Iniciales ---------------------------------------------------------------------------------
  card('initial', 'boiled-egg-seller', 'Vendedora de Huevos Cocidos', 'vendor', null, 0, gain(rice()), [[mon()], [rice()], [rice()]]),
  card('initial', 'salt-seller', 'Vendedor de Sal', 'vendor', null, 0, gain(rice()), [[mon()], [mon(2)], [rice()]]),
  card('initial', 'cotton-seller', 'Vendedor de Algodón', 'vendor', null, 0, gain(mon(), sandal()), [[sandal()], [sandal()], [sandal(), mon()]]),
  card('initial', 'glasses-seller', 'Vendedor de Anteojos', 'vendor', null, 0, gain(mon(2)), [[mon()], [mon(2)], [mon(2)]]),

  // --- Primavera ---------------------------------------------------------------------------------
  card('spring', 'book-seller', 'Vendedor de Libros', 'vendor', 1, 0, gain(mon(), sandal()), [[mon()], [mon(2)], [mon(2)]]),
  card('spring', 'sake-seller', 'Vendedor de Sake', 'vendor', 2, 0, gain(rice()), [[sandal()], [rice()], [rice()]]),
  card('spring', 'soap-bubble-maker', 'Hacedora de Pompas de Jabón', 'vendor', 2, 0, gain(wood()), [[sandal()], [sandal()], [wood()]]),
  card('spring', 'dice-maker', 'Fabricante de Dados', 'artisan', 3, 1, trade([mon()], wood()), [[iki()], [iki(2)], [iki(3)]]),
  card('spring', 'sandal-maker', 'Fabricante de Sandalias', 'artisan', 3, 1, trade([mon(2)], sandal(2)), [[iki()], [iki(2)], [iki(3)]]),
  card('spring', 'seamstress', 'Costurera', 'artisan', 3, 0, xp(), [[], [iki(2)], [iki(3)]]),
  card('spring', 'ukiyoe-artist', 'Artista de Ukiyoe', 'artisan', 4, 0, trade([iki()], mon(4)), [[], [iki()], [iki(4)]]),
  card('spring', 'monk', 'Monje', 'special', 4, 1, fire(), TOKEN_SALARY, 'hire'),
  card('spring', 'ox-cart', 'Carro de Bueyes', 'special', 3, 1, gain(sandal()), TOKEN_SALARY, 'move'),
  card('spring', 'yamabushi', 'Yamabushi', 'special', 1, 0, fire(), TOKEN_SALARY, 'avoid-fire'),
  card('spring', 'carpenter', 'Carpintero', 'builder', 6, 1, build(wood()), [[iki(2), mon()], [iki(2), mon()], [iki(3), mon(2)]]),
  card('spring', 'kite-maker', 'Constructor de Cometas', 'builder', 5, 0, swap(), [[iki(), mon()], [iki(2), mon()], [iki(3), mon(2)]]),
  card('spring', 'dyer', 'Tintorero', 'merchant', 3, 0, trade([mon(2)], iki(4)), [[mon(2)], [mon(3)], [mon(3)]]),
  card('spring', 'soba-stall', 'Puesto de Soba', 'merchant', 3, 0, trade([mon(2)], rice(2)), [[mon(2)], [mon(3)], [mon(3)]]),

  // --- Verano ------------------------------------------------------------------------------------
  card('summer', 'dumpling-seller', 'Vendedor de Dumplings', 'vendor', 1, 0, gain(rice()), [[rice()], [rice()], [rice()]]),
  card('summer', 'used-clothes-seller', 'Vendedora de Ropa Usada', 'vendor', 2, 0, gain(wood()), [[sandal()], [sandal()], [wood()]]),
  card('summer', 'water-carrier', 'Aguador', 'vendor', 2, 0, gain(mon(), sandal()), [[sandal()], [sandal()], [sandal(2)]]),
  card('summer', 'watermelon-seller', 'Vendedor de Sandías', 'vendor', 1, 0, gain(rice()), [[sandal()], [rice()], [rice()]]),
  card('summer', 'engraver', 'Grabador', 'artisan', 3, 1, trade([mon(3)], wood(2)), [[], [iki(2)], [iki(3)]]),
  card('summer', 'lantern-maker', 'Fabricante de Linternas', 'artisan', 4, 1, trade([iki()], mon(4)), [[iki()], [iki(2)], [iki(4)]]),
  card('summer', 'umbrella-maker', 'Fabricante de Sombrillas', 'artisan', 4, 1, xp(), [[iki()], [iki(3)], [iki(4)]]),
  card('summer', 'day-laborer', 'Jornalero', 'special', 1, 2, fire(), [[iki(-2)], [iki(-1)], []]),
  card('summer', 'firefighter', 'Bombero', 'special', 6, 2, fire(), [[iki()], [iki(2)], [iki(4)]]),
  card('summer', 'temple-maid', 'Sirvienta del Templo', 'special', 1, 1, fire(), TOKEN_SALARY, 'avoid-fire'),
  card('summer', 'fireworks-maker', 'Fabricante de Fuegos Artificiales', 'builder', 5, 0, gainOthers([iki(4)], [mon(2)]),
    [[iki(), mon()], [iki(3), mon()], [iki(4), mon(2)]]),
  card('summer', 'plasterer', 'Yesero', 'builder', 6, 1, build(wood()), [[iki(2), mon()], [iki(3), mon()], [iki(4), mon(2)]]),
  card('summer', 'eel-stall', 'Puesto de Anguilas', 'merchant', 3, 0, trade([mon(2)], rice(2)), [[mon(2)], [mon(3)], [mon(4)]]),
  card('summer', 'greengrocer', 'Verdulera', 'merchant', 3, 0, trade([mon(2)], rice(), wood()), [[mon()], [mon(3)], [mon(4)]]),

  // --- Otoño -------------------------------------------------------------------------------------
  card('autumn', 'firewood-seller', 'Vendedora de Leña', 'vendor', 3, 0, gain(wood()), [[sandal()], [wood()], [wood(2)]]),
  card('autumn', 'fish-seller', 'Vendedor de Pescado', 'vendor', 1, 0, gain(rice(), sandal()), [[rice()], [rice()], [rice()]]),
  card('autumn', 'mask-seller', 'Vendedor de Máscaras', 'vendor', 1, 0, gain(wood()), [[sandal()], [wood()], [wood()]]),
  card('autumn', 'clockmaker', 'Relojero', 'artisan', 3, 1, trade([mon(3)], wood(2)), [[iki(2)], [iki(3)], [iki(5)]]),
  card('autumn', 'barber', 'Peluquero', 'artisan', 3, 0, trade([mon(2)], iki(4)), [[iki(3)], [iki(4)], [iki(5)]]),
  card('autumn', 'printer', 'Impresor', 'artisan', 3, 1, xp(), [[iki(2)], [iki(3)], [iki(5)]]),
  card('autumn', 'shamisen-player', 'Intérprete de Shamisen', 'artisan', 3, 0, trade([wood()], mon(3), iki(2)), [[iki(2)], [iki(3)]]),
  card('autumn', 'construction-worker', 'Trabajador de la Construcción', 'special', 4, 1, fire(), [[iki()], [iki(3)], [iki(5)]]),
  card('autumn', 'puppeteer', 'Marionetista', 'special', 1, 0, gain(mon(3)), [[], []], 'wild'),
  card('autumn', 'geisha-tatsumi', 'Geisha Tatsumi', 'special', 7, 1, fire(iki()), [[iki(3)], [iki(5)], [iki(7)]]),
  card('autumn', 'puppet-maker', 'Fabricante de Marionetas', 'builder', 5, 1, swap(), [[iki(2), mon()], [iki(4), mon()], [iki(5), mon(2)]]),
  card('autumn', 'tatami-maker', 'Constructor de Tatamis', 'builder', 5, 1, build(wood()), [[iki(3), mon()], [iki(4), mon()], [iki(6), mon(2)]]),
  card('autumn', 'sushi-stall', 'Puesto de Sushi', 'merchant', 3, 0, trade([mon(2)], rice(2)), [[mon(3)], [mon(4)], [mon(5)]]),
  card('autumn', 'tempura-stall', 'Puesto de Tempura', 'merchant', 3, 0, trade([mon(2)], rice(2)), [[mon(4)], [mon(3)], [mon(4)]]), // así viene impreso

  // --- Invierno ----------------------------------------------------------------------------------
  card('winter', 'charcoal-seller', 'Vendedor de Carbón', 'vendor', 1, 0, gain(wood(), sandal()), [[wood()], [wood(), sandal()], [wood(), sandal()]]),
  card('winter', 'chili-seller', 'Vendedor de Chile', 'vendor', 2, 0, gain(rice(), sandal()), [[rice()], [rice()], [rice(2)]]),
  card('winter', 'candy-seller', 'Vendedor de Golosinas', 'vendor', 1, 0, gain(rice(), iki()), [[rice()], [rice()], [rice(2)]]),
  card('winter', 'candy-maker', 'Fabricante de Golosinas', 'artisan', 3, 1, trade([rice()], iki(5)), [[iki(4)], [iki(5)]]),
  card('winter', 'fan-maker', 'Fabricante de Abanicos', 'artisan', 3, 0, xp(), [[iki(3)], [iki(6)]]),
  card('winter', 'glass-blower', 'Soplador de Vidrio', 'artisan', 3, 0, trade([sandal(2)], iki(6)), [[iki(3)], [iki(6)]]),
  card('winter', 'brush-maker', 'Fabricante de Pinceles', 'artisan', 3, 0, trade([wood(), rice(), sandal()], iki(9)), [[iki(4)], [iki(6)]]),
  card('winter', 'kabuki-actor', 'Actor de Kabuki', 'special', 7, 1, gain(iki(3)), [[iki(6)], [iki(7)], [iki(9)]]),
  card('winter', 'samurai', 'Samurai', 'special', 7, 1, trade([koban()], iki(9)), [[iki(5)], [iki(7)]]),
  card('winter', 'sumo-wrestler', 'Luchador de Sumo', 'special', 5, 2, fire(), [[iki(3)], [iki(4)], [iki(7)]]),
  card('winter', 'buddhist-sculptor', 'Escultor Budista', 'builder', 4, 1, trade([wood()], iki(5)), [[iki(4), mon()], [iki(6), mon(2)]]),
  card('winter', 'karuta-maker', 'Fabricante de Karuta', 'builder', 4, 0, gainOthers([iki(4)], [mon(2)]), [[iki(3), mon(2)], [iki(6), mon(2)]]),
  card('winter', 'stone-carver', 'Tallador de Piedra', 'builder', 6, 1, build(koban()), [[iki(4), mon(2)], [iki(7), mon(2)]]),
  card('winter', 'incense-shop', 'Tienda de Incienso', 'merchant', 3, 0, trade([mon(3)], iki(5)), [[mon(4)], [mon(5)]]),
];

export const CHARACTERS_BY_ID: Record<string, Character> = Object.assign(Object.create(null), Object.fromEntries(CHARACTERS.map((c) => [c.id, c]))); // sin prototipo: «constructor» o «__proto__» no son ids
