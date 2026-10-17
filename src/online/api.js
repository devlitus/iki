/** Cliente de la API del servidor (/api). Las cookies de sesión las gestiona el navegador. */

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Respuesta sin JSON (p. ej. un fallo de la plataforma): se informa con el código.
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data);
  return data;
}
