import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022' }, // permite top-level await en main.js
});
