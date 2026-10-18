/**
 * Tableros de jugador (ver docs/reglas.md, preparación paso 9). Uno por color; cada jugador elige uno.
 *
 * - color:  color del jugador (peones, fichas y marcos del tablero).
 * - side:   cara del tablero; las imágenes son de la cara de 3-4 jugadores.
 * - image:  tablero recortado de la foto, enderezado y ampliado (ruta en /public), con fondo transparente.
 * - market: centro [x, y] de los círculos de Pescado (uno por estación), Pipa y Bolsa de Tabaco, igual que kobunSlots.
 * - kobunSlots: centro [x, y] (fracción de la imagen tumbada) de los 4 huecos de Kobun del tablero.
 * - sandalSlot: centro [x, y] del recuadro de las sandalias, igual que kobunSlots.
 */

import type { PlayerBoard } from '../types.ts';

export const PLAYER_BOARDS: PlayerBoard[] = [
  { id: 'yellow', name: 'Amarillo', color: '#e9b824', side: '3-4', image: '/player-boards/yellow.webp',
    kobunSlots: [[0.2210, 0.5915], [0.2617, 0.5915], [0.2210, 0.8259], [0.2617, 0.8259]],
    sandalSlot: [0.3702, 0.6970],
    market: { fish: [[0.5423, 0.5246], [0.6233, 0.5246], [0.7033, 0.5246], [0.7800, 0.5246]],
      pipe: [0.8640, 0.5246], bag: [0.9483, 0.5246] } },
  { id: 'blue', name: 'Azul', color: '#5aaedc', side: '3-4', image: '/player-boards/blue.webp',
    kobunSlots: [[0.2100, 0.5963], [0.2507, 0.5963], [0.2100, 0.8211], [0.2500, 0.8211]],
    sandalSlot: [0.3547, 0.6900],
    market: { fish: [[0.5227, 0.5275], [0.6033, 0.5275], [0.6800, 0.5275], [0.7533, 0.5275]],
      pipe: [0.8333, 0.5275], bag: [0.9150, 0.5275] } },
  { id: 'red', name: 'Rojo', color: '#d6323a', side: '3-4', image: '/player-boards/red.webp',
    kobunSlots: [[0.2083, 0.5928], [0.2483, 0.5928], [0.2073, 0.8166], [0.2473, 0.8166]],
    sandalSlot: [0.3530, 0.6850],
    market: { fish: [[0.5290, 0.5145], [0.6043, 0.5145], [0.6840, 0.5145], [0.7640, 0.5145]],
      pipe: [0.8483, 0.5145], bag: [0.9257, 0.5145] } },
  { id: 'purple', name: 'Morado', color: '#6b2f86', side: '3-4', image: '/player-boards/purple.webp',
    kobunSlots: [[0.2190, 0.6136], [0.2593, 0.6023], [0.2150, 0.8409], [0.2550, 0.8409]],
    sandalSlot: [0.3623, 0.7050],
    market: { fish: [[0.5417, 0.5341], [0.6190, 0.5341], [0.6973, 0.5341], [0.7767, 0.5341]],
      pipe: [0.8583, 0.5341], bag: [0.9367, 0.5341] } },
];

export const PLAYER_BOARDS_BY_ID: Record<string, PlayerBoard> = Object.assign(Object.create(null), Object.fromEntries(PLAYER_BOARDS.map((b) => [b.id, b]))); // sin prototipo: «constructor» o «__proto__» no son ids
