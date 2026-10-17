import { defineConfig } from 'vite';
import { ikiApi } from './server/dev.js';

export default defineConfig({
  plugins: [ikiApi()], // /api en desarrollo (en Vercel es la función api/[...path].js)
  build: {
    target: 'es2022', // permite top-level await en main.js
    rollupOptions: { input: { main: 'index.html', cards: 'cards.html' } },
  },
});
