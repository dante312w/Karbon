import type { HealthResponse } from '@karbon/types';
import { useEffect, useState } from 'react';

export type ServerConnection =
  | { status: 'checking' }
  | { status: 'online'; health: HealthResponse }
  | { status: 'degraded'; health: HealthResponse }
  | { status: 'offline' };

const REQUEST_TIMEOUT_MS = 4_000;

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'database' in value &&
    'version' in value
  );
}

/**
 * Consulta periódicamente `/api/v1/health`. `baseUrl` vacío = mismo origen (PWA o renderer
 * servidos por el backend, o proxy de Vite en desarrollo).
 */
export function useServerHealth(baseUrl: string, intervalMs = 10_000): ServerConnection {
  const [connection, setConnection] = useState<ServerConnection>({ status: 'checking' });

  useEffect(() => {
    let active = true;

    async function check(): Promise<void> {
      let next: ServerConnection;
      try {
        const response = await fetch(`${baseUrl}/api/v1/health`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const body: unknown = await response.json();
        next = !isHealthResponse(body)
          ? { status: 'offline' }
          : body.status === 'ok'
            ? { status: 'online', health: body }
            : { status: 'degraded', health: body };
      } catch {
        next = { status: 'offline' };
      }
      if (active) setConnection(next);
    }

    void check();
    const timer = setInterval(() => void check(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [baseUrl, intervalMs]);

  return connection;
}
