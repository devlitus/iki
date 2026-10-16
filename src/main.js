import { createBoard } from './board.js';
import { createZonesOverlay } from './zonesOverlay.js';
import { ZONES_BY_ID, zoneCenter } from './data/zones.js';
import { CHARACTERS_BY_ID } from './data/characters.js';
import { createCharacterCard } from './cards/card.js';
import './cards/card.css';
import { createBoardPicker, createPlayerDock } from './players/boardPicker.js';
import './players/players.css';

const board = await createBoard({
  viewport: document.getElementById('viewport'),
  board: document.getElementById('board'),
  image: document.getElementById('board-image'),
  pieces: document.getElementById('pieces'),
});

// Herramienta de desarrollo: Alt + clic marca un punto y muestra/copia sus coordenadas (u, v),
// para ir mapeando las casillas del tablero.
const toast = document.getElementById('toast');
const marker = document.createElement('div');
marker.className = 'coord-marker';

document.getElementById('viewport').addEventListener('click', (e) => {
  if (!e.altKey) return;
  const uv = board.clientToUV(e.clientX, e.clientY);
  if (!uv) return;
  const text = `u: ${uv.u.toFixed(4)}, v: ${uv.v.toFixed(4)}`;
  board.place(marker, uv.u, uv.v);
  toast.textContent = text;
  toast.hidden = false;
  navigator.clipboard?.writeText(`{ u: ${uv.u.toFixed(4)}, v: ${uv.v.toFixed(4)} }`).catch(() => {});
  console.log(text);
});

// Herramienta de desarrollo: la tecla Z muestra/oculta las zonas mapeadas.
const zonesOverlay = createZonesOverlay(document.getElementById('board'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'z' || e.key === 'Z') zonesOverlay.toggle();
});

// Prueba: los cuatro personajes iniciales en los solares superiores izquierdos.
const initialCards = ['boiled-egg-seller', 'salt-seller', 'cotton-seller', 'glasses-seller'];
for (const [i, charId] of initialCards.entries()) {
  const lotId = `lot-top-left-${i + 1}`;
  const lot = ZONES_BY_ID[lotId];
  const card = createCharacterCard(CHARACTERS_BY_ID[charId]);
  card.style.width = `${lot.w * 100 * 0.92}%`;
  const { u, v } = zoneCenter(lot);
  board.place(card, u, v);
}

// Tableros de jugador: la tecla J abre el selector; si aún no hay jugadores, se abre al empezar.
const renderDock = createPlayerDock(document.getElementById('player-dock'));
const picker = createBoardPicker({ onChange: renderDock });
if (picker.players.length < 2) picker.open();
window.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') && !e.target.closest?.('#board-picker')) picker.open();
});

// Expuesto para depurar desde la consola.
window.iki = { board, zones: ZONES_BY_ID, picker };
