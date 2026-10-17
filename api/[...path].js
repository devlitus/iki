import { neonDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { serve } from '../server/node-adapter.js';

/**
 * Función de Vercel: toda la API (/api/…) pasa por aquí. Necesita DATABASE_URL (Neon) y SESSION_SECRET (≥ 32 caracteres).
 */

let app;
const getApp = () => (app ??= createApp({ db: neonDb(process.env.DATABASE_URL), secret: process.env.SESSION_SECRET }));

export default serve((request) => getApp().handle(request));
