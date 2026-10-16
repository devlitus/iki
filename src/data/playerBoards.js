/**
 * Tableros de jugador (ver docs/reglas.md, preparación paso 9). Uno por color; cada jugador elige uno.
 *
 * - color:  color del jugador (peones, fichas y marcos del tablero).
 * - side:   cara del tablero; las imágenes son de la cara de 3-4 jugadores.
 * - image:  tablero recortado de la foto, enderezado y ampliado (ruta en /public), con fondo transparente.
 */

export const PLAYER_BOARDS = [
  { id: 'yellow', name: 'Amarillo', color: '#e9b824', side: '3-4', image: '/player-boards/yellow.webp' },
  { id: 'blue', name: 'Azul', color: '#5aaedc', side: '3-4', image: '/player-boards/blue.webp' },
  { id: 'red', name: 'Rojo', color: '#d6323a', side: '3-4', image: '/player-boards/red.webp' },
  { id: 'purple', name: 'Morado', color: '#6b2f86', side: '3-4', image: '/player-boards/purple.webp' },
];

export const PLAYER_BOARDS_BY_ID = Object.fromEntries(PLAYER_BOARDS.map((b) => [b.id, b]));
