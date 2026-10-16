/**
 * Generador aleatorio con semilla (mulberry32): con la misma semilla, las mezclas y las tiradas salen
 * siempre igual, así que una partida se puede repetir.
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Estado interno: createRng(state) continúa la secuencia justo donde se quedó. */
    state: () => a,
    /** Entero en [1, sides]. */
    roll: (sides = 6) => 1 + Math.floor(next() * sides),
    /** Copia mezclada (Fisher-Yates). */
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
