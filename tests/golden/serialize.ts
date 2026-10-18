import { createHash } from 'node:crypto';

/**
 * Serialización estricta para comparar comportamientos: respeta el orden de las claves (el de inserción, que es
 * determinista en JS) y distingue lo que JSON.stringify confunde o pierde (`undefined`, -0, NaN, huecos de un array).
 * Dos valores dan el mismo texto solo si cualquier código que los recorra los vería igual.
 */
export function serialize(value: any): string {
  if (value === undefined) return 'u';
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      return Object.is(value, -0) ? '-0' : Number.isNaN(value) ? 'NaN' : String(value);
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'function':
      return `fn:${value.name}`;
    default:
      break;
  }
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i++) items.push(i in value ? serialize(value[i]) : 'hole');
    return `[${items.join(',')}]`;
  }
  if (value instanceof Set) return `Set${serialize([...value])}`;
  if (value instanceof Map) return `Map${serialize([...value])}`;
  const proto = Object.getPrototypeOf(value);
  const tag = proto === Object.prototype || proto === null ? '' : `${proto?.constructor?.name ?? '?'}`;
  return `${tag}{${Object.keys(value).map((k) => `${JSON.stringify(k)}:${serialize(value[k])}`).join(',')}}`;
}

/** Huella corta (64 bits) de un valor. */
export const hash = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : serialize(value)).digest('hex').slice(0, 16);

/** Resultado de una función que puede lanzar: su huella o el error (clase y mensaje). */
export function outcome(fn: () => unknown): string {
  try {
    return hash(fn());
  } catch (e) {
    return `!${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`;
  }
}

/** Generador con semilla independiente del juego, para sustituir Math.random y crypto en la grabación. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
