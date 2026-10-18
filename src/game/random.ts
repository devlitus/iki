/**
 * Generador aleatorio con semilla: con la misma semilla, las mezclas y las tiradas salen siempre igual, así que una
 * partida se puede repetir.
 *
 * Dos tamaños de semilla:
 *   número (32 bits)       mulberry32. Para partidas locales, tests y tutorial. Con solo 2³² posibilidades, quien viera
 *                          las primeras cartas podría probarlas todas y deducir el orden de los mazos.
 *   lista de 4 números     sfc32 (128 bits). Para las partidas del servidor, con la semilla de `secretSeed()`.
 *
 * `state()` devuelve el mismo tipo que se pasó: createRng(rng.state()) continúa la secuencia donde se quedó.
 */

import type { Seed } from '../types.ts';

export type Rng = {
  next: () => number;
  state: () => Seed;
  roll: (sides?: number) => number;
  shuffle: <T>(list: T[]) => T[];
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
};

const sfc32 = (seed: number[]) => {
  if (seed.length !== 4 || !seed.every(Number.isInteger) || seed.every((n) => n === 0)) throw new Error('Semilla no válida');
  let [a, b, c, d] = seed.map((n) => n >>> 0);
  return {
    next() {
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
};

export function createRng(seed: Seed): Rng {
  const { next, state } = Array.isArray(seed) ? sfc32(seed) : mulberry32(seed);
  return {
    next,
    state,
    /** Entero en [1, sides]. */
    roll: (sides = 6) => 1 + Math.floor(next() * sides),
    /** Copia mezclada (Fisher-Yates). */
    shuffle<T>(list: T[]): T[] {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Semilla para una partida local: cualquiera sirve, nadie va a adivinarla para hacer trampa contra sí mismo. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Semilla de 128 bits con aleatoriedad criptográfica, para las partidas del servidor. Nunca debe salir de él. */
export function secretSeed() {
  const words = new Uint32Array(4);
  do globalThis.crypto.getRandomValues(words);
  while (words.every((n) => n === 0));
  return [...words];
}
