# Migración de JavaScript a TypeScript

Rama `feature/typescript`. La etiqueta `pre-ts` marca el último commit en JavaScript. **Un commit por fase** (en la fase 3,
uno por grupo de módulos). Ninguno cambia el comportamiento: si al tipar aparece un bug, se apunta aquí y se arregla
después, en un commit aparte.

## Verificación determinista

`tests/golden/` graba, sobre el código JS, lo que hace el juego y lo compara byte a byte tras cada paso de la migración:

| Capa | Escenarios | Qué se compara en cada paso |
|---|---|---|
| Motor + IA | 40 partidas IA (3 y 4 jugadores, semillas 1-20, esfuerzo `fast`), 2 en `normal`, 2 con semilla de 128 bits | acción elegida, estado, turno, candidatos y el resultado de aplicar cada uno, jugadas legales, puntuación, estadísticas, evaluación de la IA |
| Vista pública | las mismas | `publicView` |
| Jugadas no válidas | las mismas + `engine-setup` | ~30 acciones mal formadas por paso: error exacto (clase y mensaje) o estado resultante; errores de `createGame` y del generador |
| Tutorial | `tutorial-first`, `tutorial-last` | paso, textos (escritorio y móvil), zonas, progreso, jugadas permitidas |
| Interfaz | 4 partidas pintadas en happy-dom (IA, local y en línea; con `ui` vacío, a medio elegir y con error) + `view-static` + `data` | HTML del panel de turno, mazos, suministro, jugadores, piezas del tablero, ficha de jugador, resumen del Evento, tabla final, objetivos del tablero, textos del registro y de las cartas |
| Servidor | `server` (pglite) | transcripción de peticiones y respuestas: cuentas, bloqueo, CSRF, sala, partida completa con jugadas manipuladas y conflictos de versión, sala con IA, `cleanAction`, Elo |
| Código generado | `golden:bundle` | lo que genera Vite (web y, con `--ssr`, la función del servidor) comparado byte a byte con el de `pre-ts`: los tipos se borran al compilar, así que debe salir idéntico |

```sh
pnpm golden:record   # solo en pre-ts (o al añadir escenarios, grabando desde pre-ts)
pnpm golden:check    # tras cada paso: ✓ N escenarios idénticos byte a byte
pnpm golden:bundle   # tras cada paso: ✓ web y servidor generados idénticos a pre-ts
```

Todos los imports de la grabación pasan por `tests/golden/modules.js`: al renombrar a `.ts` solo cambia ese archivo.

## Fases

0. **Grabación de referencia** (commit). Se comprueba que dos ejecuciones dan lo mismo y que una mutación del motor o de
   un texto se detecta.
1. **Herramientas** (commit): `typescript`, `tsconfig.json` (`allowJs`, `noEmit`, `erasableSyntaxOnly`,
   `allowImportingTsExtensions`, `verbatimModuleSyntax`), script `typecheck`. Node ejecuta `.ts` directamente y Vite
   también.
2. **Tipos del dominio** (commit): `src/types.ts` con `Game`, `Player`, `Turn`, `Pending`, `Phase`, `Action` (unión
   por `type`) y los datos (`Zone`, `Character`, `Building`, `PlayerBoard`).
3. **Migración por grupos** (un commit por grupo): `data/` → `game/` → `ai/` → `tutorial/` → `online/` →
   `cards/`, `players/`, `view/`, `main` → `server/`, `api/` → configuración → `tests/`. Tras cada grupo:
   `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm golden:check`, `pnpm golden:bundle`.

4. **Estricto** (commit): `strict`, sin `allowJs`.
5. **Verificación final** (commit con el informe): `golden:check` contra las grabaciones de `pre-ts`; prueba cruzada
   regrabando desde cero en un worktree de `pre-ts` y comparando con las grabaciones guardadas; tests en verde.

## Bugs encontrados al tipar (se arreglan después)

- `src/game/playerStats.ts`, `ikizama`: busca `ZONES_BY_ID[p.ikizama]` con el espacio (`'1-4'`, `'2'`…), pero las zonas
  se llaman `turn-1-4`, `turn-2`…, así que nunca encuentra la etiqueta y muestra el espacio tal cual.

