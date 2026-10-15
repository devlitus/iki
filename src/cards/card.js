import { CHARACTER_TYPES } from '../data/characters.js';
import { icon, resources } from './icons.js';

const TYPE_SYMBOLS = {
  vendor: '✿',
  artisan: '◒',
  special: '❂',
  builder: '⫽',
  merchant: '◓',
};

/**
 * Crea el elemento DOM de una carta de Personaje. Todo el tamaño va en unidades relativas al ancho
 * de la carta (container queries), así que basta con fijar el ancho del elemento para escalarla.
 */
export function createCharacterCard(character) {
  const type = CHARACTER_TYPES[character.type];
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.id = character.id;
  el.style.setProperty('--type-color', type.color);

  // Marcador de experiencia, de arriba (retiro) a abajo (inicio): el retiro va en círculo.
  const levels = character.salary.map((s, i) => {
    const retired = i === character.salary.length - 1;
    return `<li class="xp ${retired ? 'xp-retired' : ''}" title="${retired ? 'Retirado' : `Nivel ${i + 1}`}">${resources(s)}</li>`;
  }).reverse().join('');

  const ability = character.ability.pay.length
    ? `${resources(character.ability.pay)}<span class="arrow">→</span>${resources(character.ability.gain)}`
    : resources(character.ability.gain);

  el.innerHTML = `
    <div class="card-body">
      <header class="card-top">
        ${character.cost == null
          ? '<span class="badge badge-initial" title="Personaje inicial">初</span>'
          : `<span class="badge badge-cost" title="Coste">${character.cost}${icon('mon')}</span>`}
        ${character.fire ? `<span class="badge badge-fire" title="Bonificación al contratar">${'🔥'.repeat(character.fire)}</span>` : ''}
      </header>
      <div class="card-art">${portrait(type.color)}</div>
      <h3 class="card-name">${character.name}</h3>
      <footer class="card-ability" title="Habilidad">${ability}</footer>
    </div>
    <aside class="card-track">
      <ol>${levels}<li class="xp xp-start" title="Inicio (nivel 1)">1</li></ol>
      <span class="card-type" title="${type.label}">${TYPE_SYMBOLS[character.type]}</span>
    </aside>`;
  return el;
}

/** Ilustración provisional: silueta de un personaje con kimono sobre un fondo de calle. */
function portrait(color) {
  return `<svg viewBox="0 0 60 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="60" height="90" fill="#efe3c8"/>
    <rect x="0" y="0" width="22" height="70" fill="#5b3a26"/>
    <path d="M2 6h18M2 20h18M2 34h18M2 48h18" stroke="#3b2416" stroke-width="1.2"/>
    <rect x="0" y="70" width="60" height="20" fill="#cdb48a"/>
    <path d="M30 28c-7 2-11 10-12 22l-3 32h30l-3-32c-1-12-5-20-12-22z" fill="${color}" opacity="0.9"/>
    <path d="M30 28c-3 6-3 14 0 22 3-8 3-16 0-22z" fill="#f6ecd8"/>
    <circle cx="30" cy="20" r="7" fill="#f1d3b3"/>
    <path d="M23 18c0-6 4-9 7-9s7 3 7 9c-2-3-4-4-7-4s-5 1-7 4z" fill="#1d1612"/>
    <ellipse cx="44" cy="66" rx="8" ry="3" fill="#8a6a3e"/>
    <circle cx="41" cy="63" r="2.4" fill="#fbf6ea"/><circle cx="46" cy="63" r="2.4" fill="#fbf6ea"/>
  </svg>`;
}
