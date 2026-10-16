/**
 * Cartas de Personaje (ver docs/reglas.md, Apéndice 1).
 *
 * - cost:       coste de contratación en mons (null en las iniciales, que no se contratan).
 * - fire:       espacios que avanza el marcador de Extinción de Incendios al contratarlo.
 * - ability:    lo que da al activarlo. `pay` = lo que hay que gastar, `gain` = lo que se recibe.
 * - salary:     salario por nivel de experiencia, de menor a mayor. El último es el del personaje retirado.
 * - art:        ilustración (ruta en /public); si falta se usa una silueta provisional.
 * - scan:       carta impresa completa, limpia y ampliada (ruta en /public); si está, se muestra en lugar de la maqueta.
 * Recursos: mon, rice, sandal, wood, koban, iki.
 */

export const CHARACTER_TYPES = {
  vendor: { label: 'Vendedor Ambulante', color: '#c9962b' },
  artisan: { label: 'Artesano', color: '#5c2a21' },
  special: { label: 'Especial', color: '#6b2a7a' },
  builder: { label: 'Constructor', color: '#b3262a' },
  merchant: { label: 'Comerciante', color: '#3f7fb5' },
};

export const CHARACTERS = [
  {
    id: 'boiled-egg-seller',
    name: 'Vendedora de Huevos Cocidos',
    season: 'initial',
    type: 'vendor',
    cost: null,
    fire: 0,
    scan: '/cards/initial-cards/boiled-egg-seller.jpg',
    ability: { pay: [], gain: [{ res: 'rice', n: 1 }] },
    salary: [
      [{ res: 'mon', n: 1 }],
      [{ res: 'rice', n: 1 }],
      [{ res: 'rice', n: 1 }],
    ],
  },
  {
    id: 'salt-seller',
    name: 'Vendedor de Sal',
    season: 'initial',
    type: 'vendor',
    cost: null,
    fire: 0,
    scan: '/cards/initial-cards/salt-seller.jpg',
    ability: { pay: [], gain: [{ res: 'rice', n: 1 }] },
    salary: [
      [{ res: 'mon', n: 1 }],
      [{ res: 'mon', n: 2 }],
      [{ res: 'rice', n: 1 }],
    ],
  },
  {
    id: 'cotton-seller',
    name: 'Vendedor de Algodón',
    season: 'initial',
    type: 'vendor',
    cost: null,
    fire: 0,
    scan: '/cards/initial-cards/cotton-seller.jpg',
    ability: { pay: [], gain: [{ res: 'mon', n: 1 }, { res: 'sandal', n: 1 }] },
    salary: [
      [{ res: 'sandal', n: 1 }],
      [{ res: 'sandal', n: 1 }],
      [{ res: 'sandal', n: 1 }, { res: 'mon', n: 1 }],
    ],
  },
  {
    id: 'glasses-seller',
    name: 'Vendedor de Anteojos',
    season: 'initial',
    type: 'vendor',
    cost: null,
    fire: 0,
    scan: '/cards/initial-cards/glasses-seller.jpg',
    ability: { pay: [], gain: [{ res: 'mon', n: 2 }] },
    salary: [
      [{ res: 'mon', n: 1 }],
      [{ res: 'mon', n: 2 }],
      [{ res: 'mon', n: 2 }],
    ],
  },
];

export const CHARACTERS_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
