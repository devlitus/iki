/**
 * Lo que un jugador puede ver de una partida alojada en el servidor. El servidor guarda el estado completo y al navegador
 * solo le manda esto: nada de lo que viaja por la red (ni lo que se ve en las DevTools) permite saber el orden de los
 * mazos, el de las losetas de Incendio ni predecir las tiradas.
 *
 * Es un estado con la misma forma que el real, con los huecos rellenos: la interfaz lo pinta igual (cuenta cartas,
 * muestra el mercado…) y `act` sigue sirviendo para comprobar jugadas dentro del turno. Una jugada que repartiría
 * cartas ocultas (terminar el turno, el Evento) no es fiable en el navegador, y da igual: el que decide es el servidor.
 *
 * En IKI toda la información de la mesa es pública (no hay manos ocultas), así que la vista es la misma para todos.
 */

/** Marcador de «carta boca abajo»: no es ningún id de carta. */
export const HIDDEN = null;

export function publicView(game) {
  const view = structuredClone(game);
  delete view.seed;
  view.rng = null;
  // Se conserva cuántas hay (se ve en la mesa) pero no cuáles ni en qué orden.
  view.decks = Object.fromEntries(Object.entries(game.decks).map(([season, cards]) => [season, cards.map(() => HIDDEN)]));
  view.fireTiles = game.fireTiles.map(() => HIDDEN);
  // Fichas de mercado de las estaciones que aún no han empezado: boca abajo hasta el cambio de estación.
  view.marketFaceDown = Object.fromEntries(Object.keys(game.marketFaceDown).map((season) => [season, { fish: [], pipes: [], bags: [] }]));
  return view;
}
