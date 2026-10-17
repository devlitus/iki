# Partidas en línea, multijugador y ranking

El modo local (hot-seat, contra IA, tutorial) sigue igual y sigue siendo manipulable: no puntúa. Todo lo que cuenta para
el ranking pasa en el servidor.

## Principio

El navegador nunca es de fiar. El servidor guarda el estado completo de la partida y el navegador solo manda
«quiero hacer esto»:

1. Comprueba que la partida está en curso y que quien pregunta está sentado **y le toca a él** (`deciderOf`).
2. Valida la acción con el mismo motor (`src/game/engine.js`, puro: `act(estado, acción) → estado`).
3. Juega los turnos de las IA que vengan después.
4. Guarda estado, versión y registro de jugadas en **una sola sentencia** SQL (todo o nada).
5. Responde con la **vista pública** (`src/game/view.js`): sin semilla, sin orden de mazos ni de losetas de Incendio.

Editar `window.iki.game` o el `localStorage` solo cambia lo que ve uno mismo; la siguiente respuesta del servidor lo
sobrescribe.

## Piezas

| Ruta | Qué es |
|---|---|
| `src/game/random.js` | RNG de 32 bits (local, tests, tutorial) y de **128 bits** (`secretSeed()`, partidas del servidor) |
| `src/game/view.js` | `publicView(estado)`: misma forma que el estado, con lo oculto vaciado |
| `server/app.js` | La API (`createApp({db, secret}).handle(Request) → Response`) |
| `server/games.js` | Salas, autoridad de turno, validación, guardado atómico, ranking |
| `server/auth.js` | Cuentas (scrypt), sesión (cookie firmada HMAC), CSRF |
| `server/db.js`, `db-local.js` | Postgres: Neon por HTTP en producción, PGlite (Postgres en WASM) en desarrollo y tests |
| `api/[...path].js` | Función de Vercel; `server/dev.js`, plugin de Vite que monta la misma API en `pnpm dev` |
| `src/online/` | Diálogo «Jugar en línea» (cuenta, salas, ranking) y cliente HTTP |

## Qué impide hacer trampa

- **Estado y semilla solo en el servidor.** Con una semilla de 32 bits bastaría ver las primeras cartas para probar las
  2³² semillas y deducir los mazos; por eso las partidas del servidor usan 128 bits.
- **Identidad:** cookie `HttpOnly`, `SameSite=Lax`, firmada con `SESSION_SECRET`: no se puede cambiar de usuario ni
  alargar. Contraseñas con scrypt; 5 fallos bloquean la cuenta 15 minutos; el mensaje no delata qué nombres existen.
- **CSRF:** las peticiones que cambian algo exigen `Origin` igual al host y cuerpo `application/json`.
- **Acciones:** lista blanca de tipos y campos, valores simples, tope de tamaño. El motor rechaza lo demás con
  `RuleError` (el servidor solo enseña esos mensajes; cualquier otro fallo es un 500 genérico).
- **Concurrencia:** cada petición lleva la `version` que vio el cliente; si no coincide, 409 con la partida al día.
  Dos peticiones simultáneas: una gana, la otra recibe el conflicto (probado).
- **Ranking:** solo cuentan partidas **clasificatorias** (todas las plazas, personas) terminadas en el servidor. El Elo se
  calcula allí y se aplica en una sentencia con marca `settled`, así que no se apunta dos veces.
- **Auditoría:** `game_actions` guarda cada jugada; semilla + jugadas reproducen la partida (probado en los tests).

## Despliegue en Vercel

1. Crear una base Neon (Vercel → Storage → Neon, o neon.tech) y copiar la cadena de conexión.
2. Variables de entorno del proyecto:
   - `DATABASE_URL`: cadena de conexión de Neon.
   - `SESSION_SECRET`: al menos 32 caracteres aleatorios (`openssl rand -base64 48`). Si cambia, se cierran todas las sesiones.
3. `vercel.json` ya fija `maxDuration: 30` para la función y cabeceras básicas. Conviene poner la región de la función
   (`regions`) junto a la de la base de datos.
4. Las tablas se crean solas en la primera petición (`CREATE TABLE IF NOT EXISTS`).

Desarrollo: `pnpm dev` levanta también la API con PGlite en `.data/` (borrar la carpeta reinicia cuentas y partidas).
Con `DATABASE_URL` definida usa Neon en su lugar.

## Pendiente / límites conocidos

- **No probado en Vercel ni contra Neon real.** Probado: la API por HTTP en `pnpm dev`, el build, y todo el SQL contra
  PGlite (Postgres real). Por verificar al desplegar: que `api/[...path].js` reciba las rutas `/api/...` y que
  `neon().query(texto, params)` se comporte igual que PGlite.
- **Partidas abandonadas:** si alguien desaparece, la partida se queda esperándole. Falta un plazo por turno y «abandonar»
  (el ausente pierde y su plaza pasa a IA).
- **Cuentas múltiples y connivencia:** no hay límite de registros por IP ni verificación de correo. Un solver o ayuda
  externa tampoco se puede detectar desde el servidor.
- **Sesiones:** no se pueden revocar una a una (caducan a los 30 días o al cambiar `SESSION_SECRET`).
- **Sondeo:** cada cliente pregunta cada 2,5 s (la respuesta sin cambios es mínima). Si hace falta más inmediatez, SSE o un
  servicio de tiempo real (Vercel no mantiene WebSockets).
- **Turnos de IA:** el servidor los juega todos de una vez; el cliente ve el resultado y el registro, sin la pausa de animación del modo local.
- La IA que juega en servidor usa esfuerzo `normal`; en los tests, una petición de una persona con 2 IA detrás tarda ~60 ms de media (incluye guardar).
- El hash de la semilla no es criptográfico (sfc32): con 128 bits aleatorios no hay forma práctica de deducirla de lo que
  se ve en la mesa, pero no es un CSPRNG.
