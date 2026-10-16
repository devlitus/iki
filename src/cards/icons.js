/** Iconos de recursos en SVG inline (viewBox 0 0 24 24), para que escalen con la carta. */
const SAKURA_PETAL = 'M12 12C9.2 10.4 7.6 7.4 8.6 4.6 9.4 2.6 11 2.4 11.4 3.8L12 5.2 12.6 3.8C13 2.4 14.6 2.6 15.4 4.6 16.4 7.4 14.8 10.4 12 12Z';

const ICONS = {
  // Moneda mon: disco con agujero cuadrado.
  mon: `<circle cx="12" cy="12" r="10" fill="#b9a27a" stroke="#4a3b22" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="#6d5a38" stroke-width="0.8"/>
        <rect x="9" y="9" width="6" height="6" fill="#f4ecdc" stroke="#4a3b22" stroke-width="1.2"/>`,
  // Arroz: saco de paja atado.
  rice: `<path d="M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3-3 5-7 5s-7-2-7-5z" fill="#d8b46a" stroke="#6b4b1c" stroke-width="1.3"/>
         <path d="M5 11h14M5 14h14" stroke="#8a6427" stroke-width="1"/>
         <path d="M9 4.5 12 7l3-2.5" fill="none" stroke="#6b4b1c" stroke-width="1.3"/>`,
  // Sandalia (geta) en perspectiva: suela de madera con la tira azul en «V».
  sandal: `<path d="M3.5 21 8 3.5h8.5L21 21z" fill="#d9bf8f" stroke="#2a1a0e" stroke-width="1.4" stroke-linejoin="round"/>
           <path d="M5.2 15.5h13.6" stroke="#9c7a48" stroke-width="0.8"/>
           <path d="M7.4 9.5 10 14.5l2.2-4.6 2.3 4.6 2.4-5" fill="none" stroke="#1b1f4a" stroke-width="2.6" stroke-linejoin="round"/>
           <path d="M7.4 9.5 10 14.5l2.2-4.6 2.3 4.6 2.4-5" fill="none" stroke="#5a64c8" stroke-width="1.1" stroke-linejoin="round"/>`,
  // Madera: troncos.
  wood: `<rect x="3" y="8" width="18" height="8" rx="4" fill="#8b5a2b" stroke="#3e2410" stroke-width="1.3"/>
         <ellipse cx="18" cy="12" rx="2.5" ry="3.6" fill="#d6a86b" stroke="#3e2410" stroke-width="1"/>`,
  // Koban: moneda de oro ovalada.
  koban: `<ellipse cx="12" cy="12" rx="7" ry="10" fill="#e1b83c" stroke="#7a5a10" stroke-width="1.4"/>
          <ellipse cx="12" cy="12" rx="2" ry="2.6" fill="#b08a1e"/>`,
  // IKI: flor de cerezo rosa con los pétalos escotados.
  iki: `<g fill="url(#sakura-fill)" stroke="#c24f8e" stroke-width="0.5">
          ${[0, 72, 144, 216, 288].map((a) => `<path d="${SAKURA_PETAL}" transform="rotate(${a} 12 12)"/>`).join('')}
        </g>
        <g stroke="#b02a6c" stroke-width="0.45" stroke-linecap="round">
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M12 12v-2.6" transform="rotate(${a} 12 12)"/>`).join('')}
        </g>
        <circle cx="12" cy="12" r="1.1" fill="#7a1747"/>`,
};

// Recursos que en la carta se muestran con un solo icono y la cantidad superpuesta.
const NUMBERED = new Set(['iki']);

const DEFS = `<defs><radialGradient id="sakura-fill" cx="12" cy="12" r="11" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#d66aa6"/><stop offset="0.45" stop-color="#f3b4d6"/><stop offset="1" stop-color="#fbe4f0"/>
</radialGradient></defs>`;

export function icon(res) {
  return `<svg class="icon icon-${res}" viewBox="0 0 24 24" aria-hidden="true">${DEFS}${ICONS[res] ?? ''}</svg>`;
}

/** Lista de recursos [{res, n}] → iconos repetidos (n ≤ 3), o icono con la cantidad superpuesta. */
export function resources(list) {
  return list
    .map(({ res, n }) => (NUMBERED.has(res) || n > 3
      ? `<span class="res-n">${icon(res)}<span class="qty">${n}</span></span>`
      : icon(res).repeat(n)))
    .join('');
}

/** Símbolos de la columna lateral: tipo de personaje, Kobun y retiro. */
export const GLYPHS = {
  // Abanico plegable con borla (Artesano).
  artisan: fan(),
  // Kobun: figura con kimono, en el espacio inicial del marcador.
  kobun: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="4.6" r="2.6" fill="#1a1412"/>
    <path d="M8.2 8.2h7.6l1.4 13.6H6.8z" fill="#1a1412"/>
    <path d="M10 8.4l2 3.6 2-3.6" fill="none" stroke="#f7f1e6" stroke-width="0.8"/>
    <path d="M8 13h8" stroke="#f7f1e6" stroke-width="0.7"/>
  </svg>`,
  // Retiro: carta con flecha curva.
  retire: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="9" width="11" height="12" rx="1.2" fill="#fbf7ee" transform="rotate(-12 8.5 15)"/>
    <path d="M9 11c2-5 7-6 10-3" fill="none" stroke="#fbf7ee" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M20.5 4.5 20 9.5l-4.6-1.2z" fill="#fbf7ee"/>
  </svg>`,
};

/** Abanico abierto de 150° con varillas y borla, centrado en (50, 70) dentro de 100×110. */
function fan() {
  const cx = 50, cy = 70;
  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const arc = (r) => `M${pt(r, -165)}A${r} ${r} 0 0 1 ${pt(r, -15)}`;
  const ribs = Array.from({ length: 17 }, (_, i) => `M${pt(6, -165 + i * 9.375)}L${pt(46, -165 + i * 9.375)}`).join('');
  return `<svg viewBox="0 0 100 110" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="${arc(47)}" stroke-width="4"/>
    <path d="${arc(41)}" stroke-width="1.6"/>
    <path d="${arc(18)}" stroke-width="1.6"/>
    <path d="${ribs}" stroke-width="1.8"/>
    <circle cx="${cx}" cy="${cy}" r="3.2" fill="currentColor" stroke="none"/>
    <path d="M50 74c-4 9-17 9-17 3s11-7 17-3c6-4 17-3 17 3s-13 6-17-3" stroke-width="3"/>
    <path d="M50 76C40 88 22 94 6 96M50 76c8 9 16 13 26 14" stroke-width="3"/>
    <path d="M76 90l14 12M74 94l10 12M79 88l15 8" stroke-width="2.4"/>
  </svg>`;
}
