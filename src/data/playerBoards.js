/**
 * Tableros de jugador (ver docs/reglas.md, preparación paso 9). Uno por color; cada jugador elige uno.
 *
 * - color:  color del jugador (peones, fichas y marcos del tablero).
 * - side:   cara del tablero; las imágenes son de la cara de 3-4 jugadores.
 * - image:  tablero recortado de la foto, enderezado y ampliado (ruta en /public), con fondo transparente.
 * - kobunSlots: centro [x, y] (fracción de la imagen tumbada) de los 4 huecos de Kobun del tablero.
 */

export const PLAYER_BOARDS = [
  { id: 'yellow', name: 'Amarillo', color: '#e9b824', side: '3-4', image: '/player-boards/yellow.webp',
    kobunSlots: [[0.2210, 0.5915], [0.2617, 0.5915], [0.2210, 0.8259], [0.2617, 0.8259]] },
  { id: 'blue', name: 'Azul', color: '#5aaedc', side: '3-4', image: '/player-boards/blue.webp',
    kobunSlots: [[0.2100, 0.5963], [0.2507, 0.5963], [0.2100, 0.8211], [0.2500, 0.8211]] },
  { id: 'red', name: 'Rojo', color: '#d6323a', side: '3-4', image: '/player-boards/red.webp',
    kobunSlots: [[0.2083, 0.5928], [0.2483, 0.5928], [0.2073, 0.8166], [0.2473, 0.8166]] },
  { id: 'purple', name: 'Morado', color: '#6b2f86', side: '3-4', image: '/player-boards/purple.webp',
    kobunSlots: [[0.2190, 0.6136], [0.2593, 0.6023], [0.2150, 0.8409], [0.2550, 0.8409]] },
];

export const PLAYER_BOARDS_BY_ID = Object.fromEntries(PLAYER_BOARDS.map((b) => [b.id, b]));
