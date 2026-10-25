# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Versión web del juego de mesa **IKI** (3-4 jugadores): local en la misma pantalla, contra IA, tutorial guiado y partidas
en línea con ranking. El código, los comentarios, la interfaz y los documentos están en español; los commits, en inglés
(`fix: …`, `feat: …`, `chore: …`), cada cambio en una rama `feature/…` o `fix/…` fusionada en `main` con `--no-ff`.

## Al empezar un encargo nuevo

1. **Ramas huérfanas.** Comprobar que no queda ninguna rama sin fusionar en `main` (`git branch --no-merged main` y
   `git branch -r --no-merged main`). Si queda alguna, lo primero es fusionarla, pero solo después de verificar de forma
   determinista que no se rompe nada: `pnpm typecheck`, `pnpm test` y `pnpm golden:check` con todos los escenarios
   idénticos. Si `golden:check` difiere, averiguar por qué antes de volver a grabar: solo se graba de nuevo si el cambio
   de comportamiento es el pretendido y se reproduce igual en cada ejecución.
2. **Plan.** Escribir el plan del encargo en `docs/plan-<tema>.md` (objetivo, decisiones, pasos y cómo se verifica) antes
   de tocar el código, e ir marcando en él lo hecho y lo pendiente.
3. **Rama.** Crear una rama nueva (`feature/…`, `fix/…`, `docs/…`) para cada encargo, salvo que el encargo esté
   relacionado con la rama en la que ya se está trabajando: entonces se sigue en esa.

## Comandos

```sh
pnpm dev                     # Vite + la API en /api (server/dev.ts) con Postgres local PGlite en .data/pglite
pnpm test                    # node --test tests/*.test.ts
node --test tests/engine.test.ts                        # un archivo
node --test --test-name-pattern="fase A" tests/*.test.ts  # tests cuyo nombre coincide
pnpm typecheck               # tsc (solo comprueba tipos, no emite nada)
pnpm golden:check [filtro]   # compara la grabación de referencia byte a byte con tests/golden/fixtures/
pnpm golden:record [filtro]  # vuelve a grabarla (solo si el cambio de comportamiento es intencionado)
pnpm build                   # build estático de Vite
pnpm build:vercel            # build + función de la API para Vercel (scripts/build-vercel.ts)
```

- No hay paso de compilación: Node (type stripping, Node ≥ 22) y Vite ejecutan los `.ts` tal cual. Por eso los imports
  llevan la extensión `.ts` y solo se admite sintaxis TypeScript borrable (`erasableSyntaxOnly`: nada de `enum`,
  `namespace` ni propiedades de parámetro en constructores).
- El botón «Jugar en línea» solo aparece con `VITE_ONLINE=1` (en `.env.local` para desarrollo). Con `DATABASE_URL` en el
  entorno, `pnpm dev` usa esa base (Neon) en lugar de PGlite.

## Arquitectura

**Motor puro** (`src/game/`): `act(estado, acción) → estado nuevo` en `engine.ts`. No toca el DOM ni modifica el estado
recibido; una jugada no válida lanza `RuleError`. El estado (`Game`, en `src/types.ts`) es JSON plano: se guarda en
`localStorage`, viaja por la red y se compara en tests. Las fases (`game.phase`) y las acciones están documentadas en la
cabecera de `engine.ts`. El azar sale de un RNG con semilla guardado en el propio estado (`random.ts`), así que semilla +
jugadas reproducen una partida. Las reglas del juego están transcritas en `docs/reglas.md`.

**IA** (`src/ai/`): también pura. `chooseAction(estado)` prueba las jugadas candidatas con el mismo motor
(`candidates`/`tryAct`) y elige la que mejor valora `evaluate.ts`. `deciderOf`/`isAiTurn` dicen a quién le toca. Detalles
en `docs/ia.md`.

**Interfaz** (`src/main.ts` + `src/view/`, `src/players/`, `src/cards/`, `src/tutorial/`): DOM a mano, sin framework.
`main.ts` es el controlador: guarda `game`, llama a `render()` y envía las acciones por `dispatch`, que en una partida en
línea se convierte en una petición al servidor. El tablero es una imagen 2D con zoom (`board.ts`) y piezas colocadas en
coordenadas normalizadas de las zonas de `src/data/zones.ts`. Los datos de cartas, mazos y mercado están en `src/data/`.
Hay una distribución propia para móvil en horizontal (`view/mobile.ts`, `mobile.css`).

**Servidor** (`server/`, ver `docs/servidor.md`): autoritativo. El navegador solo manda «quiero hacer esto»; el servidor
comprueba el turno, valida con el mismo `act`, juega las IA, guarda estado + versión + jugada en una sola sentencia SQL y
responde con `publicView` (`src/game/view.ts`: sin semilla ni orden de mazos o losetas). Cada acción lleva la `version`
que vio el cliente (409 si no coincide). `server/app.ts` es la API como `Request → Response`, montada en Vercel por
`server/vercel.ts` y en desarrollo por `server/dev.ts`. Base de datos: Neon en producción, PGlite en desarrollo y tests.
Solo las partidas con todas las plazas ocupadas por personas puntúan para el ranking (Elo en `rating.ts`).

## Tests

- `tests/*.test.ts` usan `node:test`. `tests/helpers.ts` crea partidas de prueba ya preparadas (`newGame(n, seed)`).
  `server.test.ts` levanta la API sobre PGlite en memoria. `secrecy.test.ts` comprueba que la vista pública no filtra
  nada oculto.
- `tests/golden/`: grabación determinista de todo el comportamiento (motor, IA, vistas con happy-dom, tutorial,
  servidor). Sirve para refactorizar sin cambiar nada: si `golden:check` difiere, el cambio altera el comportamiento.
