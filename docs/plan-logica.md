# Plan — lógica de juego de IKI

Objetivo: pasar de la preparación (pasos 1-13, ya hechos) a una partida completa jugable de 3-4 jugadores en el
mismo navegador (*hot-seat*), con portada al entrar y tabla de puntuación al final. Reglas: `docs/reglas.md`.

Rama: `feature/logica-juego`. Cada fase termina con verificación y un commit.

---

## 0. Decisiones de partida

| Tema | Decisión propuesta |
|---|---|
| Jugadores | 3-4 humanos en la misma pantalla, por turnos (*hot-seat*). Sin IA. |
| 2 jugadores | Fuera de alcance: falta la cara de 2 jugadores del tablero. |
| Arquitectura | Motor **puro** (sin DOM): `estado + acción → estado nuevo`. La vista solo pinta el estado y envía acciones. |
| Persistencia | Estado en `localStorage` (como ahora). Sube `GAME_VERSION` → las partidas viejas se descartan. |
| Deshacer | Pila de estados anteriores dentro del turno del jugador activo (se vacía al pasar el turno). |
| Azar | El RNG con semilla ya existente; su estado se guarda en la partida para que sea reproducible. |
| Tests | `node --test` sobre el motor (sin dependencias nuevas). |

---

## 1. Datos (fase 1)

### 1.1 Personajes — `src/data/characters.js`
Completar las 60 cartas (4 iniciales + 56) con los datos leídos de los escaneos de `public/cards/`:

- `cost`, `fire` (0, 1 o 2 espacios), `type`, `season`, `scan`.
- `ability`: tipo y parámetros. Tipos de habilidad necesarios:
  - `gain` — recibe recursos/IKI (p. ej. Vendedor de Libros: 1 mon + 1 sandalia).
  - `trade` — paga → recibe (p. ej. Tintorero: 2 mons → 4 IKI).
  - `fire` — +1 en el marcador de Extinción (Monje, Yamabushi, Bombero…); Geisha: `fire` + 1 IKI.
  - `xp` — paga 1 mon → +1 experiencia a uno de **tus** personajes (Costurera, Sombrillas, Impresor, Abanicos).
  - `build` — construye un Edificio con descuento (−1 madera: Carpintero, Yesero, Tatamis; −1 Koban: Tallador).
  - `swap` — intercambia 2 cartas de Personaje del tablero (Cometas, Marionetas).
  - `gainOthers` — gana 4 IKI y cada oponente 2 mons (Fuegos Artificiales, Karuta).
- `salary`: una entrada por casilla de experiencia por encima del Kobun; la última es la del retirado.
  Longitud 3 (normal) o 2 (marcador corto). Retiro cuando `xp === salary.length`.
- `retireToken`: ficha especial al retirarse (Monje → `hire`, Carro de Bueyes → `move`, Yamabushi y Sirvienta →
  `avoid-fire`, Marionetista → `wild`). Esas cartas no tienen salario.

Datos leídos de las cartas que **corrigen o completan** `reglas.md`:

| Carta | Dato |
|---|---|
| Especiales con retiro (Monje 4, Carro 3, Yamabushi 1, Sirvienta 1, Marionetista 1) | sin salario; solo la ficha al retirarse. Marionetista: marcador corto. |
| Jornalero | salario −2 → −1 → 0 IKI |
| Costes | todos leídos de las cartas (p. ej. Carpintero 6, Geisha 7, Samurai 7). |

### 1.2 Edificios — `src/data/decks.js`
Coste e IKI de cada uno (leídos de las cartas):

| Edificio | Coste | Final |
|---|---|---|
| Granja | 1 madera, 1 sandalia, 2 mons | 2 · cada Día de Pago, +2 IKI por Kobun alimentado |
| Torre Antiincendios | 1 madera, 1 arroz, 1 sandalia | 3 · +3 IKI al contratar personaje con fuego |
| Villa Imperial | 1 madera, 4 mons | 4 · cada Día de Pago, +2 mons por personaje del tipo más contratado |
| Taberna | 1 madera, 1 Koban | 12 |
| Teatro de Kabuki | 3 maderas, 2 Koban | 26 |
| Santuario | 2 maderas, 2 Koban | 22 |
| Casa Comercial | 2 maderas, 1 sandalia, 1 Koban | 3 × sandalia (máx. 30) |
| Almacén | 1 madera, 1 arroz, 1 Koban | 4 × arroz (máx. 32) |
| Restaurante | 3 maderas, 2 arroces | = IKI del pescado |
| Pozo | 4 maderas | 2 × nivel de Extinción |

### 1.3 Fichas de mercado — `src/data/market.js` (nuevo)
Por estación, 2 pescados, 2 pipas y 2 bolsas; con imagen, coste en mons y efecto/IKI:

| Estación | Pescado (coste → extra) | Pipas (coste: efecto) | Bolsas (coste: IKI final) |
|---|---|---|---|
| Primavera | 2 → 0 · 4 → +1 | 2: +1 fuego · 3: +1 fuego | 2: 2 · 4: 3 |
| Verano | 2 → 0 · 7 → +7 | 2: +1 arroz · 3: +2 sandalias | 5: 4 · 5: 1 por cada 2 de fuego |
| Otoño | 2 → 0 · 4 → +1 | 2: +1 fuego · 4: +2 fuego | 3: 1 por personaje del tipo más contratado · 5: 1 por tipo distinto |
| Invierno | 2 → 0 · 9 → +7 | 2: +1 experiencia · 7: +1 Koban | 1: 1 por cada 4 mons · 5 (provisional): 5 IKI |

> Falta la imagen y el coste real de la bolsa de Invierno de 5 IKI: provisional a 5 mons y con ficha dibujada.

### 1.4 Calle, tiendas y puestos — `src/data/zones.js`
Añadir a cada casilla de la calle su tienda y sus 2 puestos (los solares detrás del pergamino):

| Casilla | Tienda | Puestos |
|---|---|---|
| `street-t1` | Arroz | `lot-top-left-1`, `-2` |
| `street-t2` | Sandalias | `lot-top-left-3`, `-4` |
| `street-t3` | Cambio | `lot-top-right-1`, `-2` |
| `street-t4` | Pescado | `lot-top-right-3`, `-4` |
| `street-b1` | Torre de Incendios | `lot-bottom-left-1`, `-2` |
| `street-b2` | Tabaco | `lot-bottom-left-3`, `-4` |
| `street-b3` | Casa de Empeños | `lot-bottom-right-1`, `-2` |
| `street-b4` | Construcción | `lot-bottom-right-3`, `-4` |

Nagayas: 4 grupos de 4 solares + grupo de esquinas. Losetas de Incendio por estampado del solar exterior:
amarillo = arriba-izq., azul = arriba-der., rojo = abajo-izq., morado = abajo-der.

**Verificación**: `cards.html` muestra las 60 cartas; un script comprueba que cada id de los mazos tiene datos.

---

## 2. Motor de juego (fase 2) — `src/game/engine.js` (+ módulos auxiliares)

### 2.1 Estado (ampliación del actual)
```
month 1..13 · phase · row: [{card, mons}] · market (fichas de la estación boca arriba)
ikizama: { '1-4': player|null, '1':…, '2':…, '3':…, '4':… }
turn: { player, step, didShop, didChar, … }      // turno en curso de la fase B
pending: decisión que falta (ver 2.4) · log: [...] · rng: estado del generador
players[i]: resources, kobun, iki, fire, oyakata, fish[], pipes[], bags[], retired[], buildings[], specials[]
lots: lotId → { kind: 'character'|'building', card, owner, xp }
fireStack: orden de la pila (arriba primero)
```

### 2.2 Flujo de un mes (meses 1-12)
1. **Inicio**: se revelan 4 cartas del mazo de la estación a la fila.
2. **Fase A — Camino de la Vida**: por orden de Extinción (más avanzado primero; empate → más arriba en la pila),
   cada jugador pone su Ikizama en una casilla libre (`1-4`, `1`, `2`, `3`, `4`).
3. **Fase B — Acciones**, en orden `1-4`, `1`, `2`, `3`, `4`:
   - **B1** (no para `1-4`, que gana 1 mon): *Ingresos* (+4 mons) o *Contratar* (carta de la fila + mons que tenga;
     coste − Contratar −1; +2 en esquina; Kobun libre; fuego de la carta; Torre Antiincendios +3 IKI).
   - **B2 Movimiento**: exacto según el Ikizama (`1-4` elige 1-4) + sandalias (1 por casilla) + Mover +1 (opcional).
     Al pasar la casilla de vuelta (entre `street-t3` y `street-t2`): +1 experiencia a todos tus personajes, con
     retiros. Desde la zona inicial, el primer paso lleva a `street-t2` sin dar vuelta.
   - **Negocios** (en cualquier orden, cada uno opcional): la tienda de la casilla y un personaje de sus puestos.
     Personaje ajeno → +1 experiencia (puede retirarse). Edificios no se activan.
   - **B3**: el Ikizama vuelve al jugador.
4. **Fase C — Evento**:
   - Meses 1, 2, 4, 7, 10: +1 mon a cada carta de la fila.
   - Meses 5, 8, 11: **Incendio** (fuerza 5, 8, 10) y luego +1 mon a la fila.
   - Meses 3, 6, 9, 12: **Día de Pago** → cambio de estación (fila y mercado fuera; mes 12: el mercado de Invierno
     se queda y los Oyakata se recogen) → salario → Armonía → comida (Granja, Villa Imperial).
5. Avanza el calendario.

### 2.3 Mes 13 — Año Nuevo y final
Por orden de Extinción, cada jugador pone su Oyakata en cualquier casilla y hace negocios (tienda y/o personaje).
Luego: recoger cartas, elegir tipo del Marionetista (Comodín) y puntuación final.

### 2.4 Decisiones pendientes (`pending`)
> **Hecho en fases A/B**: las elecciones (solar, personaje que gana experiencia, cartas a intercambiar, ficha de
> mercado…) viajan como parámetros de la propia acción (`hire { card, lot }`, `character { lot, target }`…), así que
> el motor nunca queda a medias. `legalActions(game)` enumera las jugadas válidas completas. El deshacer vive en la
> interfaz (guarda los estados anteriores del turno), no en el motor. `pending` solo hará falta para las decisiones
> que surgen en mitad de un evento (comida, incendio, Marionetista):

> **Hecho en la fase C**: `game.pending` (`{ type, player, … }`) y la acción `resolve`. Solo `food` y `avoidFire`;
> el Marionetista se decide al final con `wildType` (`resolve { cardType }`).

El motor se para y pide una elección cuando hace falta:
- solar donde colocar la carta contratada / el edificio;
- qué personaje propio gana experiencia (Costurera, Pipa de Invierno…);
- qué 2 cartas intercambiar (Cometas, Marionetas);
- qué personajes se pierden si falta arroz;
- usar o no «Evitar un incendio» cuando un personaje propio va a arder;
- tipo del Marionetista al final.

### 2.5 Reglas puntuales a respetar
IKI nunca negativo · un pescado por estación y jugador · Extinción máx. 10 (si ya está, sube arriba de la pila) ·
la bonificación de fuego no se pierde si el personaje muere · edificios cuentan para frenar el incendio pero no
para la Armonía ni se alimentan · personaje retirado: no come y cobra el salario máximo · ficha especial solo al
retirarse.

**Verificación**: tests `node --test` para cada regla (contratar, mover y dar vuelta, retiro, Día de Pago con el
ejemplo de Armonía de la p. 8, incendio con el ejemplo de la p. 9, fin de partida) y una partida simulada completa
con acciones aleatorias legales que termine sin errores.

---

## 3. Puntuación (fase 3) — `src/game/scoring.js`
Filas de la tabla: marcador · variedad (1/4/9/16/25) · pescado (3/6/10/15 + extras) · tabaco (×2 con pipa) ·
edificios · Koban ×3 · madera ×1 · 4 mons = 1. Desempate: Extinción, luego posición en la pila.
Sustituye la estimación actual de `playerStats.js`.

**Verificación**: test con el ejemplo de Paula de la p. 11 = 100 IKI.

---

## 4. Interfaz (fase 4)

1. **Portada**: pantalla inicial con la imagen de la caja (`public/cover.webp`, a partir de `portada.jpeg`) y botones
   *Nueva partida* / *Continuar*. Después, el selector de tableros actual.
2. **Panel de turno** (columna izquierda, sustituye a «Pasos de preparación» al terminar la preparación): mes,
   estación, fase, jugador activo y los botones de la acción que toca (Ingresos/Contratar, ± sandalias, tienda,
   personaje, terminar turno, deshacer).
3. **Tablero interactivo**: casillas del Ikizama, casillas de destino de la calle, solares libres, cartas activables;
   resaltado de lo legal en cada momento. Fichas reales (`public/tokens`, `public/pawns`) en lugar de las formas.
4. **Fila de cartas**: las 4+ cartas reveladas con sus mons encima.
5. **Diálogos** para las decisiones pendientes y para el resumen de Día de Pago e Incendio.
6. **Registro** de lo que ha pasado (últimas entradas).
7. **Tabla de puntuación final** como la libreta: filas con iconos (jugadores, flor de marcador, ≠ variedad,
   pescado, pipa, edificio, flor ×3 Koban, flor ×1 madera, flor ×1 cada 4 mons, =) y una columna por jugador; ganador
   resaltado.

> **Hecho (fase 4)**: portada (`view/cover.js`), panel de turno con deshacer y registro (`view/turnPanel.js`), fila de
> cartas con sus mons, objetivos pulsables en el tablero, piezas reales (`view/boardPieces.js`), diálogos de comida,
> incendio y Comodín en el propio panel, resumen del Evento y tabla final (`view/dialogs.js`), ampliación de cartas al
> pasar el ratón. Las elecciones previas a confirmar viven en `ui` (main.js); las acciones las valida el motor.

**Verificación**: jugar en el navegador una partida de 3 jugadores hasta la tabla final, sin errores en consola, y
revisar en apaisado móvil que no se rompe.

---

## 5. Orden de trabajo
1. Datos (1.1-1.4) → commit.
2. Motor: estado y fases A/B → tests → commit.
3. Motor: fase C (Día de Pago, Incendio, cambio de estación) → tests → commit.
4. Motor: mes 13 y puntuación → tests → commit.
5. Interfaz: portada y panel de turno → commit.
6. Interfaz: tablero interactivo, fila y diálogos → commit.
7. Interfaz: tabla final → partida completa de prueba → commit.

---

## 6. Dudas resueltas
1. **Bolsa de Tabaco de Invierno de 5 IKI**: no hay foto. Provisional: coste 5 mons, 5 IKI, ficha dibujada.
2. **Casilla de vuelta**: el primer movimiento desde la zona inicial no da experiencia.
3. **Puestos**: los 2 solares de detrás del pergamino de cada tienda (tabla 1.4).
4. **Coste extra**: solo existe el +2 de las esquinas.
5. **Jugadores**: 3-4 en la misma pantalla, sin IA.
