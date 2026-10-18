import { createApp } from './app.ts';
import { serve } from './node-adapter.ts';
import type { Plugin } from 'vite';
import type { Db } from './types.ts';

/**
 * Servidor de la API para `pnpm dev`: la misma aplicación que corre en Vercel, montada en el servidor de Vite y con un
 * Postgres local (PGlite) guardado en .data/. Si hay DATABASE_URL se usa esa base (Neon) en su lugar.
 */
export function ikiApi(): Plugin {
  return {
    name: 'iki-api',
    apply: 'serve',
    async configureServer(server) {
      let db: Db;
      if (process.env.DATABASE_URL) db = (await import('./db.ts')).neonDb(process.env.DATABASE_URL);
      else db = await (await import('./db-local.ts')).localDb('.data/pglite');
      const secret = process.env.SESSION_SECRET ?? 'clave-solo-para-desarrollo-local-0123456789';
      const app = createApp({ db, secret });
      server.middlewares.use('/api', serve((request) => app.handle(request)) as unknown as Parameters<typeof server.middlewares.use>[1]);
      server.httpServer?.on('close', () => db.close?.());
    },
  };
}
