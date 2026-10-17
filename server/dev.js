import { createApp } from './app.js';
import { serve } from './node-adapter.js';

/**
 * Servidor de la API para `pnpm dev`: la misma aplicación que corre en Vercel, montada en el servidor de Vite y con un
 * Postgres local (PGlite) guardado en .data/. Si hay DATABASE_URL se usa esa base (Neon) en su lugar.
 */
export function ikiApi() {
  return {
    name: 'iki-api',
    apply: 'serve',
    async configureServer(server) {
      let db;
      if (process.env.DATABASE_URL) db = (await import('./db.js')).neonDb(process.env.DATABASE_URL);
      else db = await (await import('./db-local.js')).localDb('.data/pglite');
      const secret = process.env.SESSION_SECRET ?? 'clave-solo-para-desarrollo-local-0123456789';
      const app = createApp({ db, secret });
      server.middlewares.use('/api', serve((request) => app.handle(request)));
      server.httpServer?.on('close', () => db.close?.());
    },
  };
}
