import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServerHealth } from './use-server-health';

const HEALTH_OK = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 5,
  database: 'up',
  timestamp: '2026-09-25T12:00:00.000Z',
};

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useServerHealth', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reporta conectado cuando el servidor y la base de datos responden', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(Response.json(HEALTH_OK)));
    const { result } = renderHook(() => useServerHealth('http://localhost:3000'));

    expect(result.current.status).toBe('checking');
    await waitFor(() => {
      expect(result.current.status).toBe('online');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/health',
      expect.anything(),
    );
  });

  it('reporta degradado cuando la base de datos no responde', async () => {
    mockFetch(() =>
      Promise.resolve(
        Response.json({ ...HEALTH_OK, status: 'degraded', database: 'down' }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useServerHealth(''));
    await waitFor(() => {
      expect(result.current.status).toBe('degraded');
    });
  });

  it('reporta sin conexión ante errores de red o respuestas inesperadas', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useServerHealth(''));
    await waitFor(() => {
      expect(result.current.status).toBe('offline');
    });

    mockFetch(() => Promise.resolve(Response.json({ hola: 'mundo' })));
    const second = renderHook(() => useServerHealth(''));
    await waitFor(() => {
      expect(second.result.current.status).toBe('offline');
    });
  });
});
