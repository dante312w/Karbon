import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient, NetworkError } from './http-client';
import { createMemorySessionStore } from './session-store';

function client(): HttpClient {
  return new HttpClient('http://servidor', createMemorySessionStore());
}

function respond(status: number, body: string, contentType = 'application/json'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(body, { status, headers: { 'Content-Type': contentType } })),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpClient', () => {
  it('convierte el cuerpo de error de la API en ApiError con su código', async () => {
    respond(
      409,
      JSON.stringify({
        statusCode: 409,
        error: 'Conflict',
        message: 'La mesa ya tiene un pedido',
        code: 'TABLE_OCCUPIED',
        path: '/',
        timestamp: '',
      }),
    );
    const error = await client()
      .get('/tables')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('TABLE_OCCUPIED');
  });

  it('trata un 502 del proxy (HTML) como falta de conexión para poder encolar', async () => {
    respond(502, '<html>Bad Gateway</html>', 'text/html');
    await expect(client().get('/tables')).rejects.toBeInstanceOf(NetworkError);
  });

  it('trata un fallo de red como NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(client().get('/tables')).rejects.toBeInstanceOf(NetworkError);
  });

  it('un 500 sin cuerpo de la API sigue siendo ApiError (no se reintenta a ciegas)', async () => {
    respond(500, 'boom', 'text/plain');
    await expect(client().get('/tables')).rejects.toBeInstanceOf(ApiError);
  });
});
