import type { QueryClient } from '@tanstack/react-query';
import type { ClientToServerEvents, ServerToClientEvents } from '@karbon/types';
import { createContext, useContext } from 'react';
import type { Socket } from 'socket.io-client';
import type { KarbonApi } from '../api';
import type { HttpClient } from '../http-client';
import type { SessionStore } from '../session-store';

export type KarbonSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface KarbonContextValue {
  baseUrl: string;
  http: HttpClient;
  api: KarbonApi;
  sessions: SessionStore;
  socket: KarbonSocket;
  queryClient: QueryClient;
}

export const KarbonContext = createContext<KarbonContextValue | null>(null);

export function useKarbon(): KarbonContextValue {
  const context = useContext(KarbonContext);
  if (!context) throw new Error('useKarbon debe usarse dentro de <KarbonProvider>');
  return context;
}

export function useApi(): KarbonApi {
  return useKarbon().api;
}
