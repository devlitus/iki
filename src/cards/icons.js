/** Iconos de recursos en SVG inline (viewBox 0 0 24 24), para que escalen con la carta. */
const ICONS = {
  // Moneda mon: disco con agujero cuadrado.
  mon: `<circle cx="12" cy="12" r="10" fill="#b9a27a" stroke="#4a3b22" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="#6d5a38" stroke-width="0.8"/>
        <rect x="9" y="9" width="6" height="6" fill="#f4ecdc" stroke="#4a3b22" stroke-width="1.2"/>`,
  // Arroz: saco de paja atado.
  rice: `<path d="M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3-3 5-7 5s-7-2-7-5z" fill="#d8b46a" stroke="#6b4b1c" stroke-width="1.3"/>
         <path d="M5 11h14M5 14h14" stroke="#8a6427" stroke-width="1"/>
         <path d="M9 4.5 12 7l3-2.5" fill="none" stroke="#6b4b1c" stroke-width="1.3"/>`,
  // Sandalia (geta).
  sandal: `<rect x="6" y="4" width="12" height="16" rx="5" fill="#a8743f" stroke="#4d2f14" stroke-width="1.3"/>
           <path d="M8 9c1.5 2 6.5 2 8 0M12 10.5V7" fill="none" stroke="#c0392b" stroke-width="1.6"/>`,
  // Madera: troncos.
  wood: `<rect x="3" y="8" width="18" height="8" rx="4" fill="#8b5a2b" stroke="#3e2410" stroke-width="1.3"/>
         <ellipse cx="18" cy="12" rx="2.5" ry="3.6" fill="#d6a86b" stroke="#3e2410" stroke-width="1"/>`,
  // Koban: moneda de oro ovalada.
  koban: `<ellipse cx="12" cy="12" rx="7" ry="10" fill="#e1b83c" stroke="#7a5a10" stroke-width="1.4"/>
          <ellipse cx="12" cy="12" rx="2" ry="2.6" fill="#b08a1e"/>`,
  // IKI: flor rosa de cinco pétalos.
  iki: `<g fill="#e57aa3" stroke="#8e2f55" stroke-width="0.9">
          ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="6.5" rx="3.6" ry="4.6" transform="rotate(${a} 12 12)"/>`).join('')}
        </g><circle cx="12" cy="12" r="2.4" fill="#fbe3a0" stroke="#8e2f55" stroke-width="0.8"/>`,
};

export function icon(res) {
  return `<svg class="icon icon-${res}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[res] ?? ''}</svg>`;
}

/** Lista de recursos [{res, n}] → iconos repetidos (n ≤ 3) o «n × icono». */
export function resources(list) {
  return list
    .map(({ res, n }) => (n <= 3 ? icon(res).repeat(n) : `<span class="qty">${n}</span>${icon(res)}`))
    .join('');
}
