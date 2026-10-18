/** Errores y respuestas HTTP comunes. */

export class HttpError extends Error {
  declare status: number;
  declare extra: Record<string, unknown>;

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const fail: (status: number, message: string, extra?: Record<string, unknown>) => never = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const MAX_BODY = 8 * 1024;

/** Cuerpo JSON de la petición (objeto), con tope de tamaño. */
export async function readJson(request: Request): Promise<Record<string, any>> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('application/json')) fail(415, 'El cuerpo debe ser JSON');
  const text = await request.text();
  if (text.length > MAX_BODY) fail(413, 'Petición demasiado grande');
  let body: any;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    fail(400, 'JSON no válido');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Se esperaba un objeto JSON');
  return body;
}
