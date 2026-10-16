# Jugadores de IA

Rama: `feature/jugadores-ia`. En el selector de tableros, cada asiento se puede marcar como **IA** (por defecto, humano);
`createGame` lo guarda en `players[i].ai`. Se puede mezclar humanos e IA, o jugar solo con IA.

## Cómo juega (`src/ai/`)

- `player.js` — `chooseAction(estado)` devuelve la siguiente acción del jugador al que le toca decidir (la misma forma
  que entiende `act`). `deciderOf` / `isAiTurn` dicen a quién le toca. Es puro: no toca el DOM.
- `evaluate.js` — valora una posición en puntos de IKI: la puntuación final real (`scoring.js`) más lo que aún no
  puntúa pero acabará valiendo (recursos, personajes con su salario y habilidad, fichas especiales, Extinción de
  Incendios, Armonía, comida del próximo Día de Pago y riesgo del próximo Incendio). Resta una parte de lo que ganan los
  rivales. Los pesos de los recursos pasan de los de mitad de partida a los de final a partir del mes 8.

Para cada decisión prueba las jugadas posibles (`candidates` + `tryAct` del motor, que son las mismas que valida
`act`) y mira unos pasos adelante dentro de su turno:

| Decisión | Cómo elige |
|---|---|
| Personaje inicial | Mejor posición tras colocarlo, con un extra por la cercanía del solar al Oyakata |
| Ikizama (fase A) | Simula el turno que tendría en cada espacio libre y se queda con el mejor, más un pequeño extra por jugar antes |
| B1 (ingresos o contratar) | Estudia a fondo las contrataciones más prometedoras y, para cada una, mira el movimiento y los negocios siguientes |
| Mover | Elige el destino por lo que podrá hacer allí (tienda + personaje) |
| Negocios | Mejor combinación de tienda y personaje, o terminar el turno |
| Comida, Incendio, Comodín | Prueba todas las respuestas y se queda con la mejor posición |

`effort: 'normal'` (partida real, ≈0,5-1,5 s por decisión en el peor caso) o `'fast'` (pruebas).

## Interfaz (`src/main.js`)

Cuando le toca a una IA, tras una pausa de 0,7 s (para que se vea lo que hace) juega su acción. Espera mientras haya
un diálogo abierto (resumen del Evento, puntuación final), la portada o el selector. Durante su turno el panel dice que
está pensando y el tablero y las cartas no se pueden pulsar. Lo que juega la IA no se puede deshacer. Si la IA falla,
se detiene en lugar de repetir el error.

## Nivel

Contra jugadores que eligen al azar gana 8 de 8 partidas (≈93 IKI de media frente a ≈35). Entre IA las partidas
terminan con ≈70-125 IKI. No usa información oculta (mazos, losetas de Incendio), pero tampoco anticipa lo que harán
los rivales ni planea más allá de su turno.
