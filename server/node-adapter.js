import { json } from './http.js';

/**
 * Puente entre el Node de siempre (req, res: las funciones de Vercel y el servidor de Vite) y la API, que habla
 * Request/Response estándar.
 */

const MAX_BODY = 16 * 1024;

async function readBody(req) {
  // Vercel ya puede haber leído y convertido el cuerpo (req.body); Vite no.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Petición demasiado grande'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function toRequest(req) {
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] ?? (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`${proto}://${host}${req.originalUrl ?? req.url}`, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined });
}

export async function sendResponse(res, response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Función (req, res) para Vercel o Vite a partir de `handle(Request) → Response`. */
export function serve(handle) {
  return async (req, res) => {
    let response;
    try {
      response = await handle(await toRequest(req));
    } catch (error) {
      console.error(error);
      response = json({ error: error.status === 413 ? error.message : 'Error del servidor' }, error.status ?? 500);
    }
    await sendResponse(res, response);
  };
}
