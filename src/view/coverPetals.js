/**
 * Pétalos de sakura que cruzan la portada empujados por ráfagas de viento. Un lienzo a pantalla completa, sin
 * eventos de ratón; `start` y `stop` encienden y apagan la animación para no gastar nada mientras se juega.
 */
const PETALS_PER_MPX = 38;
const MAX_PETALS = 70;
const COLORS = ['#ffd3df', '#ffc0d0', '#ffe4ec', '#f7b2c4', '#fff0f4'];

export function createPetals(canvas) {
  const ctx = canvas.getContext('2d');
  let petals = [];
  let raf = 0;
  let last = 0;
  let time = 0;
  let width = 0;
  let height = 0;

  const spawn = (anywhere) => {
    const size = 5 + Math.random() * 7;
    return {
      x: anywhere ? Math.random() * width : -20 - Math.random() * width * 0.3,
      y: anywhere ? Math.random() * height : Math.random() * height * 0.8 - height * 0.2,
      size,
      // Los grandes van «más cerca»: caen y avanzan algo más deprisa.
      fall: 18 + size * 3 + Math.random() * 12,
      drift: 22 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      swing: 0.6 + Math.random() * 1.2,
      spin: (Math.random() - 0.5) * 3,
      angle: Math.random() * Math.PI * 2,
      flip: Math.random() * Math.PI * 2,
      flipSpeed: 1.5 + Math.random() * 2.5,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.min(MAX_PETALS, Math.round((width * height) / 1e6 * PETALS_PER_MPX) + 8);
    while (petals.length < target) petals.push(spawn(true));
    petals.length = target;
  };

  // Viento: una brisa constante más ráfagas lentas que van y vienen.
  const wind = (t) => 1 + 0.9 * Math.max(0, Math.sin(t * 0.23) * Math.sin(t * 0.61 + 1.3));

  const drawPetal = (p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Al «voltear» el pétalo se estrecha: da sensación de giro en 3D sin coste.
    ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.8, s * 0.8, s * 0.6, 0, s);
    ctx.bezierCurveTo(-s * 0.8, s * 0.6, -s * 0.9, -s * 0.8, 0, -s);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    // La muesca del pétalo de cerezo.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 1.05);
    ctx.lineTo(0, -s * 0.72);
    ctx.lineTo(s * 0.18, -s * 1.05);
    ctx.fill();
    ctx.restore();
  };

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;
    const w = wind(time);
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      p.phase += dt * p.swing;
      p.x += (p.drift * w + Math.sin(p.phase) * 25) * dt;
      p.y += (p.fall + Math.cos(p.phase * 1.3) * 10) * dt;
      p.angle += p.spin * dt * w;
      p.flip += p.flipSpeed * dt;
      if (p.y > height + 20 || p.x > width + 20) petals[i] = spawn(false);
      drawPetal(p);
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (raf) return;
      resize();
      window.addEventListener('resize', resize);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', resize);
    },
  };
}
