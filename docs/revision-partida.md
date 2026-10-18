# Revisión de una partida completa (2026-10-18)

Partida de 3 jugadores en la interfaz (rama `feature/typescript`, `pnpm dev`): Rojo humano (jugado con clics, como un
jugador real) contra Azul y Morado (IA). 12 meses + Día de Año Nuevo. Cada jugada se auditó contra `docs/reglas.md`
leyendo el estado (`window.iki.game`) antes y después.

Resultado: Rojo 113 · Azul 89 · Morado 87.

## Reglas comprobadas sin fallos

- Preparación: el inicial se elige con dados; personajes iniciales en sentido antihorario (Morado → Azul → Rojo) y en
  solares exteriores; pila de Incendios en sentido horario.
- Fase A: el mes 1 coloca el jugador inicial; desde el mes 2, por nivel de Incendios y, en empate, la ficha de arriba
  (la que llega a una casilla ocupada se pone encima).
- B1: Ingresos +4; contratar paga coste + 2 en esquina, recoge los mons de la carta; solo se ofrecen solares que se
  pueden pagar; sin Kobun no se ofrece contratar. Bonificación de fuego al contratar.
- 1-4: juega primero, +1 mon y sin B1. Sandalias para mover más; «Mover +1» opcional y permanente.
- Vuelta (entre Cambio y Sandalias): +1 experiencia a todos tus personajes antes de los negocios; se resuelven retiros.
- Negocios: personaje propio no gana experiencia; el de un rival sí, y puede retirarse (el Kobun vuelve a su dueño).
- Retiro al llegar al círculo (3 pasos; 2 en los marcadores cortos: Marionetista, Shamisen, Soplador de Vidrio,
  Fabricante de Abanicos); fichas de retiro (Mover +1, Evitar un incendio, Comodín).
- Tiendas: Arroz, Sandalias, Torre, Tabaco (pipa con efecto inmediato, elige destino de la experiencia), Empeños,
  Construcción, Pescado (uno por estación), Cambio (+2 mons).
- Habilidades: intercambio de 2 personajes sin coste extra; «tus oponentes ganan 2 mons» (también si la activa su
  dueño); construir con 1 madera menos (Constructor de Tatamis); Pinceles, Escultor, Soplador, Tintorero, etc.
- Fin de mes 1/2/4/5/7/8/10/11: 1 mon en cada carta de la fila; 4 cartas nuevas de la estación.
- Día de Pago (3, 6, 9, 12): salario por nivel y máximo de los retirados; Armonía (fórmula propias × total, grupos de
  Nagaya); comida; cambio de estación (fichas y cartas); el mes 12 deja las fichas de invierno y recoge los Oyakata.
- Incendios (5, 8, 11; fuerza 5, 8, 10): roba quien más nivel tiene; −1 por solar; arde si el nivel del dueño es menor;
  se detiene si es igual o mayor (también con un Edificio); la loseta vuelve a la pila.
- Año Nuevo: orden por Incendios; Oyakata en cualquier casilla; tienda y personaje.
- Puntuación final: marcador, variedad, pescado (+7/+1 de los caros), tabaco doblado con pipa (búho: 1 por cada
  4 mons), edificios (Villa 4, Pozo 2 × nivel), recursos. Los tres totales cuadran a mano.

## Bugs

1. **El registro no dice qué cartas se intercambian.** Al usar el Fabricante de Marionetas o el Constructor de
   Cometas, el registro solo pone «X activa a Fabricante de Marionetas de Y». En la partida, Azul y Morado movieron
   cartas mías de Nagaya (una a un solar exterior justo antes de un incendio) y no quedó rastro de qué se movió ni a
   dónde. `src/game/abilities.ts` (`swap`) no registra nada y `src/view/format.ts` (`case 'character'`) no tiene datos
   que mostrar.
2. **Los ingresos de la Villa Imperial y la Granja no aparecen en el registro.** En el Día de Pago del mes 12 el
   registro dice «salario: 9 mons», pero recibí 13 (4 de la Villa). `perks()` en `src/game/events.ts` llama a
   `receive` sin `log`.
3. **Los botones de construir muestran el coste sin descuento.** Con el Constructor de Tatamis, la Villa Imperial se
   ofrecía como «1 madera, 4 mons» y cobró solo 4 mons. Por el Lugar de Construcción la etiqueta tampoco suma el mon de
   la tienda. `src/view/turnPanel.ts:271` y `:310` usan `costText(BUILDINGS_BY_ID[b].cost)`.
4. **«Edificios · N al azar» cuenta los que quedan.** Empieza en «6 al azar» y al final de la partida decía «4 al
   azar» porque se construyeron 2. `src/view/table.ts:80` usa `game.buildings.length`.
5. **«Comprar» de la Tienda de Tabaco se desactiva sin explicar por qué.** Con pipa de 4 + bolsa de 3 y 6 mons, el
   botón se pone gris sin decir que faltan mons.

## Dudas (no son fallos claros)

- **Numeración del registro**: el 1 es la entrada más reciente («1. Mes 1» queda abajo del todo). Puede ser
  intencionado, pero se lee como orden cronológico.
- **Coste extra de los solares** (resuelta con las fotos del reglamento): B1 dice literalmente «Recuerda pagar el
  coste extra del espacio (1 o 2 mons) si lo hubiera», y el ejemplo del Monje solo usa las esquinas (+2). En el lado
  de 3-4 jugadores no hay solares de +1, así que el código es correcto; el +1 será del lado de 2 jugadores (en la
  página 12 el puesto central lleva un icono «+1», sin texto que lo explique), que no está implementado.
- **Variedad y personajes quemados** (resuelta con las fotos del reglamento): al no alimentarlos «Las cartas de
  personaje se eliminan de la partida», y al final «Los jugadores recuperan sus cartas de Personaje que aún estén en
  el tablero principal y las colocan en las columnas de sus tableros de jugador» antes de puntuar. Una carta
  eliminada no llega al tablero de jugador, así que no cuenta para la variedad. El código es correcto.
