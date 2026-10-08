import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { createApi } from '../api';
import { ApiError, HttpClient } from '../http-client';
import { createLocalSessionStore } from '../session-store';
import { KarbonContext, type KarbonContextValue, type KarbonSocket } from './context';
import {
  clearPersistedCache,
  discardStaleCaches,
  hydrateCache,
  persistCache,
} from './persisted-cache';
import { bindRealtimeCache, bindResumeSync } from './realtime';

export interface KarbonProviderProps {
  /** Origen del servidor. Vacío = mismo origen (PWA o renderer servidos por el backend). */
  baseUrl: string;
  /** Clave de la sesión en localStorage (distinta por app para no mezclar sesiones). */
  storageKey: string;
  /**
   * Identificador del build de la app. La caché que guardó otro build se descarta al abrir:
   * así una actualización nunca arranca con datos que tienen la forma anterior.
   */
  cacheVersion: string;
  children: ReactNode;
}

function cachePrefix(storageKey: string): string {
  return `${storageKey}.cache`;
}

function createClient(baseUrl: string, storageKey: string, cache: string): KarbonContextValue {
  const sessions = createLocalSessionStore(storageKey);
  const http = new HttpClient(baseUrl, sessions);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Los errores de negocio no se reintentan; los de red sí, un par de veces.
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
  const socket: KarbonSocket = io(baseUrl || undefined, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // Se lee en cada (re)conexión: siempre viaja el token vigente.
    auth: (callback) => {
      callback({ token: sessions.get()?.accessToken });
    },
  });
  discardStaleCaches(cachePrefix(storageKey), cache);
  if (sessions.get()) hydrateCache(queryClient, cache);
  return { baseUrl, http, api: createApi(http), sessions, socket, queryClient };
}

export function KarbonProvider({
  baseUrl,
  storageKey,
  cacheVersion,
  children,
}: KarbonProviderProps) {
  const cache = `${cachePrefix(storageKey)}.${cacheVersion}`;
  const [client] = useState(() => createClient(baseUrl, storageKey, cache));

  useEffect(() => bindRealtimeCache(client.socket, client.queryClient), [client]);
  useEffect(
    () =>
      bindResumeSync({
        socket: client.socket,
        queryClient: client.queryClient,
        hasSession: () => client.sessions.get() !== null,
      }),
    [client],
  );
  useEffect(() => persistCache(client.queryClient, cache), [client, cache]);

  useEffect(() => {
    const { socket, sessions, http, queryClient } = client;
    const sync = (): void => {
      if (sessions.get()) {
        if (!socket.connected) socket.connect();
      } else {
        socket.disconnect();
        queryClient.clear();
        clearPersistedCache(cache);
      }
    };
    // El servidor desconecta sockets con token vencido: se renueva la sesión y se reconecta.
    const onServerDisconnect = (reason: string): void => {
      if (reason !== 'io server disconnect' || !sessions.get()) return;
      void http.refresh().then((session) => {
        if (session) socket.connect();
      });
    };
    socket.on('disconnect', onServerDisconnect);
    sync();
    const unsubscribe = sessions.subscribe(sync);
    return () => {
      unsubscribe();
      socket.off('disconnect', onServerDisconnect);
      socket.disconnect();
    };
  }, [client, cache]);

  return (
    <KarbonContext value={client}>
      <QueryClientProvider client={client.queryClient}>{children}</QueryClientProvider>
    </KarbonContext>
  );
}
