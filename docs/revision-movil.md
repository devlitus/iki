# Revisión de una partida en móvil (2026-10-18)

Partida de 3 jugadores en la interfaz móvil (`main`, `pnpm dev`), emulando un teléfono en horizontal de 844×390 con
pantalla táctil (`pointer: coarse`, toques reales, sin ratón). Amarillo humano (jugado tocando, como un jugador real)
contra Azul y Rojo (IA). 12 meses + Día de Año Nuevo. Cada jugada se auditó contra `docs/reglas.md` leyendo el estado
(`window.iki.game`) antes y después.

Resultado: Rojo 88 · Azul 82 · Amarillo 57.

## Reglas comprobadas sin fallos

- Preparación: inicial con dados (con desempate); personajes iniciales en sentido antihorario desde el inicial
  (Azul → Amarillo → Rojo), solo en solares exteriores libres; pila de Incendios en sentido horario.
- Fase A: mes 1 en sentido horario desde el inicial; desde el mes 2 por nivel de Incendios y, en empate, la ficha que
  llegó la última (arriba de la pila). Comprobado con empates a 1, 4, 5, 8 y 9.
- B1: Ingresos +4; contratar cobra coste + 2 en esquina y recoge los mons de la carta (también cuando superan el
  coste: Vendedor de Máscaras con «Contratar −1» y 1 mon encima dio +1 mon); las esquinas no se ofrecen si no se
  pueden pagar; bonificación de fuego (Jornalero +2, Bombero +2, Luchador de Sumo +2).
- 1-4: +1 mon, sin B1, de 1 a 4 pasos. Sandalias para pasos extra (Rojo y Azul, 2 sandalias cada uno).
- Vuelta: +1 experiencia a todos los personajes del jugador, incluido el recién contratado, antes de los negocios;
  retiros en el acto (Monje → ficha «Contratar −1»; Anteojos y Peluquero en la misma vuelta).
- Negocios: personaje propio sin experiencia (Jornalero, Vendedor de Máscaras, Bombero de Rojo); el de un rival sí,
  y se retira al llegar al círculo (Puesto de Soba, Vendedora de Huevos, Vendedor de Sake, Luchador de Sumo).
  Marcador corto: Tallador de Piedra se retira en 2 pasos.
- Tiendas: Arroz, Sandalias, Torre (sube encima de la pila), Tabaco (pipa de verano +2 sandalias al comprarla),
  Pescado (uno por estación), Cambio (+2), Construcción (+1 mon de la tienda, Villa Imperial en esquina +2).
- Habilidades: Tallador de Piedra construye la Taberna con 1 Koban menos (solo 1 madera, sin el mon de la tienda).
- Fin de mes: 1 mon en cada carta de la fila; las cartas se acumulan y salen 4 nuevas.
- Día de Pago (3, 6, 9, 12): salarios por nivel (retirados al máximo; Jornalero −1 IKI con el marcador en 0 se queda
  en 0 antes de sumar la Armonía); Armonía por Nagaya y por tipo (propias × total); comida; cambio de estación; Villa
  Imperial +2 mons por personaje del tipo más contratado (contando retirados e iniciales); el mes 12 deja las fichas
  de invierno y recoge los Oyakata.
- Incendios (meses 5, 8, 11; fuerza 5, 8, 10): roba el de más nivel (empate: el de arriba); −1 por solar; arde si el
  nivel del dueño es menor y se detiene si es igual (Carpintero de Azul a 3 contra fuerza 3, y a 6 contra 6);
  «Evitar un incendio» de la Sirvienta del Templo salvó al Tallador de Piedra; el nivel de Incendios no baja al perder
  un personaje con bonificación.
- Año Nuevo: orden por Incendios (Azul, Rojo, Amarillo); Oyakata en cualquier casilla; tienda y personaje.
- Puntuación final: marcador, variedad (personajes quemados no cuentan), pescado (3 estaciones = 10 + 1 + 1 + 7),
  tabaco doblado con pipa, edificios, recursos. Los tres totales cuadran a mano.

No llegó a darse: falta de arroz (elegir quién se va), «Evitar un incendio» del jugador humano, intercambio de
cartas, Comodín del Marionetista ni «Mover +1».

## Bugs

1. **El registro pone la cabecera «Mes N» debajo de sus entradas.** El panel muestra las 8 últimas entradas de la
   más reciente a la más antigua, pero la entrada `month` es la primera de cada mes, así que queda al final de su
   grupo: las jugadas del mes anterior aparecen bajo «Mes N». En el mes 2 se leía «Amarillo activa a Puesto de Soba…
   / **Mes 2** / Rojo usa Torre de Incendios…» (lo de Rojo era del mes 1). `src/view/turnPanel.ts:131`.
2. **La puntuación final se abre desplazada hacia abajo.** En 844×390 el `<dialog>` tiene `scrollTop` 209 al abrirse
   porque el foco va al botón «Cerrar» del final: no se ve quién gana ni la cabecera de la tabla, solo los totales y
   las fichas de cada jugador. Hay que subir a mano para ver el título.
3. **En vertical, la portada se corta.** A 390×844 la portada (z-index 30) tapa el aviso de girar el teléfono
   (`#rotate-hint`, `src/view/table.css:248`) y no cabe: la carátula y los botones se salen por los lados.
4. **La Villa Imperial aparece en la columna «Pago» del Día de Pago.** «Amarillo gana 6 mons por Villa Imperial» sale
   junto a «alimenta a N personaje(s)», no en «Salario». `PAYDAY_INCOME` (`src/view/dialogs.ts:20`) no incluye
   `perk`.
5. **El coste de contratar puede salir negativo.** Con «Contratar −1» y 1 mon sobre una carta de coste 1, los solares
   dicen «Contratar a Vendedor de Máscaras aquí · -1 mons» (`src/view/turnPanel.ts:96`, `hireCost`). Debería decir
   que no cuesta nada y que te quedas 1 mon.

## Dudas (no son fallos claros)

- **Salario negativo en el registro.** Con el marcador en 0, el Jornalero registra `iki: -1` y el resumen lo cuenta
  como «−1 IKI», aunque no se pierde nada (el IKI no puede ser negativo). El cálculo es correcto; solo el texto
  confunde.
- **Ampliar cartas desactivadas.** `src/view/mobile.ts:118` permite ampliar una carta desactivada al tocarla, pero al
  tocar el Bombero (6 mons, solo tenía 4) no se abrió la ampliación. Puede que el toque llegara mientras el panel
  Mesa aún se deslizaba; no se ha podido repetir porque la fila se vació. Hay que probarlo en un teléfono.

## Mejoras de UI/UX en móvil

Ordenadas por impacto.

1. **Aviso de Incendio.** En los meses 5, 8 y 11 nada avisa de que al final del mes habrá un incendio, ni de su
   fuerza. Un aviso en la cabecera del panel de turno («🔥 Incendio al final del mes · fuerza 8; tu nivel: 5») ayudaría
   a elegir Ikizama y solar.
2. **Registro corto y difícil de seguir.** Solo se ven 8 entradas y un mes con 3 jugadores tiene unas 15: no se puede
   repasar lo que hicieron las IA. Proponer: agrupar por mes (cabecera arriba), mostrar el mes entero y que «Registro»
   abra la lista completa en un panel. Además, el `summary` «Registro» mide 15 px de alto: difícil de tocar.
3. **Lo que compran los demás.** El registro dice «usa Tienda de Tabaco» o «usa Mercado de Pescado» sin decir qué ficha
   compró ni cuánto pagó (se pierde información de la partida). Lo mismo con Empeños (¿arroz o sandalia?) y
   Construcción (¿arroz o edificio?).
4. **Coste de las esquinas sobre el tablero.** Al contratar, los solares libres se marcan igual tanto si cuestan
   +2 como si no; el coste solo está en el `title`/`aria-label`, que en táctil no se ve. Una etiqueta «+2» sobre las
   esquinas lo dejaría claro.
5. **Tablero pequeño.** Con el panel de turno abierto el tablero queda en unos 396×362 px: los Oyakata y las fichas son
   casi invisibles y cuesta saber dónde está el tuyo. Ideas: resaltar el Oyakata del jugador en turno y la casilla de
   destino al elegir pasos, o permitir ampliar el tablero con dos dedos.
6. **Destino con nombre interno.** «Llegas a Calle arriba 2 · Tienda de Sandalias»: «Calle arriba 2» no significa nada
   para el jugador. Basta con el nombre de la tienda (y los personajes de sus puestos, como ya hace).
7. **Fichas de pescado, pipa y tabaco sin texto.** Al ampliarlas solo se ve la ficha; las cartas sí muestran un
   resumen («Al activarlo…»). Añadir coste, efecto e IKI al final.
8. **Elegir personaje inicial.** Tras «Elegir» se cierra el panel y no queda ningún texto que diga «toca un solar
   exterior»: solo los bordes discontinuos. Un aviso flotante o la línea del panel de turno lo resolvería.
9. **Incendio partido en dos diálogos.** Cuando una IA decide si usa «Evitar un incendio», el diálogo se abre a medias
   («Incendio de fuerza 10»), la IA «está pensando…» hasta que se cierra, y luego sale otro diálogo del mismo incendio
   que solo dice «Azul evita el incendio» (sin decir qué personaje salva). Mejor un único resumen al final, con qué
   carta se salvó y con qué fuerza se paró el fuego («se detiene en el Carpintero de Azul: nivel 3 contra fuerza 3»).
10. **Configuración de jugadores.** Con 3 jugadores ya elegidos, el título dice «Jugador 4: elige tu color», que parece
    obligar a añadir un cuarto. El nombre del humano queda vacío («Jugador 1» en gris).
11. **Plurales.** «Mover 1 espacio(s)», «alimenta a 2 personaje(s)», «1 sandalias», «1 mons»: mejor concordar.
12. **Puntuación final.** «Desempate: Extinción de Incendios y posición en la pila» aparece aunque no haya empate.
13. **Panel Jugadores.** El jugador humano sale el último; en una partida contra la IA conviene ponerlo primero.
