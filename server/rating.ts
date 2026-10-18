/**
 * Puntuación de ranking (Elo adaptado a más de dos jugadores): cada jugador se compara con cada otro como si fuera un
 * duelo, gana quien quedó por delante y se reparte el factor K entre los rivales. La suma de cambios es ~0.
 */

export const START_RATING = 1000;
export const K = 32;

/** `place` 1 = ganador; devuelve el cambio de cada uno, en el mismo orden. */
export function eloDeltas(players: { rating: number; place: number }[], k = K): number[] {
  const n = players.length;
  if (n < 2) return players.map(() => 0);
  return players.map((me, i) => {
    let surplus = 0;
    players.forEach((other, j) => {
      if (i === j) return;
      const expected = 1 / (1 + 10 ** ((other.rating - me.rating) / 400));
      const actual = me.place < other.place ? 1 : me.place === other.place ? 0.5 : 0;
      surplus += actual - expected;
    });
    return Math.round((k / (n - 1)) * surplus);
  });
}
