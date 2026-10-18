import { neonDb } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { serve } from '../server/node-adapter.ts';

/**
 * Función de Vercel: toda la API (/api/…) pasa por aquí. Necesita DATABASE_URL (Neon) y SESSION_SECRET (≥ 32 caracteres).
 */

let app: ReturnType<typeof createApp> | undefined;
const getApp = () => (app ??= createApp({ db: neonDb(process.env.DATABASE_URL), secret: process.env.SESSION_SECRET }));

export default serve((request) => getApp().handle(request));
