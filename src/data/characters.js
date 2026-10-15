/**
 * Cartas de Personaje (ver docs/reglas.md, Apéndice 1).
 *
 * - cost:       coste de contratación en mons (null en las iniciales, que no se contratan).
 * - fire:       espacios que avanza el marcador de Extinción de Incendios al contratarlo.
 * - ability:    lo que da al activarlo. `pay` = lo que hay que gastar, `gain` = lo que se recibe.
 * - salary:     salario por nivel de experiencia, de menor a mayor. El último es el del personaje retirado.
 * Recursos: mon, rice, sandal, wood, koban, iki.
 */

export const CHARACTER_TYPES = {
  vendor: { label: 'Vendedor Ambulante', color: '#c9962b' },
  artisan: { label: 'Artesano', color: '#7a2230' },
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
    ability: { pay: [], gain: [{ res: 'rice', n: 1 }] },
    salary: [
      [{ res: 'mon', n: 1 }],
      [{ res: 'rice', n: 1 }],
      [{ res: 'rice', n: 1 }],
    ],
  },
];

export const CHARACTERS_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
