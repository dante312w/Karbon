import type { QueryClient } from '@tanstack/react-query';
import {
  type EventEnvelope,
  type KitchenTicketDto,
  type OrderDto,
  type Paginated,
  SocketEvent,
  type SocketEventMap,
  type StaffCallDto,
  type TableDto,
} from '@karbon/types';
import { isOrderActive, mergeStaffCall } from '@karbon/utils';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { queryKeys } from '../query-keys';
import { type KarbonSocket, useKarbon } from './context';

type ActiveOrders = Paginated<OrderDto>;

/**
 * Traduce los eventos del servidor a la caché de React Query: los datos que llegan completos
 * (pedido, mesa, configuración) se escriben directo; el resto se invalida para recargar.
 */
export function bindRealtimeCache(socket: KarbonSocket, queryClient: QueryClient): () => void {
  const seen = new Set<string>();
  const fresh = (envelope: EventEnvelope<unknown>): boolean => {
    if (seen.has(envelope.id)) return false;
    seen.add(envelope.id);
    if (seen.size > 500) seen.clear();
    return true;
  };

  const onOrder = (envelope: EventEnvelope<SocketEventMap['order.updated']>): void => {
    if (!fresh(envelope)) return;
    const { order } = envelope.data;
    queryClient.setQueryData(queryKeys.order(order.id), order);
    queryClient.setQueryData<ActiveOrders>(queryKeys.activeOrders, (current) => {
      if (!current) return current;
      const others = current.items.filter((candidate) => candidate.id !== order.id);
      return { ...current, items: isOrderActive(order.status) ? [order, ...others] : others };
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
  };

  // Lista o entregada: la comanda llega completa y se reemplaza en los tableros donde ya estaba.
  const onTicket = (envelope: EventEnvelope<SocketEventMap['kitchen.ready']>): void => {
    if (!fresh(envelope)) return;
    const { ticket } = envelope.data;
    queryClient.setQueriesData<KitchenTicketDto[]>({ queryKey: queryKeys.tickets }, (current) =>
      current?.map((candidate) => (candidate.id === ticket.id ? ticket : candidate)),
    );
  };

  const onTable = (envelope: EventEnvelope<SocketEventMap['table.changed']>): void => {
    if (!fresh(envelope)) return;
    const { table } = envelope.data;
    queryClient.setQueryData<TableDto[]>(queryKeys.tables, (current) => {
      if (!current) return current;
      const exists = current.some((candidate) => candidate.id === table.id);
      return exists
        ? current.map((candidate) => (candidate.id === table.id ? table : candidate))
        : [...current, table];
    });
  };

  const onStaffCall = (envelope: EventEnvelope<SocketEventMap['staff_call.updated']>): void => {
    if (!fresh(envelope)) return;
    queryClient.setQueryData<StaffCallDto[]>(queryKeys.staffCalls, (current) =>
      mergeStaffCall(current, envelope.data.call),
    );
  };

  const handlers = {
    [SocketEvent.ORDER_CREATED]: onOrder,
    [SocketEvent.ORDER_UPDATED]: onOrder,
    [SocketEvent.TABLE_CHANGED]: onTable,
    [SocketEvent.KITCHEN_READY]: onTicket,
    [SocketEvent.KITCHEN_DELIVERED]: onTicket,
    [SocketEvent.STAFF_CALL_CREATED]: onStaffCall,
    [SocketEvent.STAFF_CALL_UPDATED]: onStaffCall,
    [SocketEvent.INVENTORY_UPDATED]: (
      envelope: EventEnvelope<SocketEventMap['inventory.updated']>,
    ) => {
      if (!fresh(envelope)) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.ingredients });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAlerts });
    },
    [SocketEvent.CASH_CLOSED]: (envelope: EventEnvelope<SocketEventMap['cash.closed']>) => {
      if (fresh(envelope)) void queryClient.invalidateQueries({ queryKey: queryKeys.cash });
    },
    [SocketEvent.NOTE_OPTIONS_CHANGED]: (
      envelope: EventEnvelope<SocketEventMap['note_options.changed']>,
    ) => {
      if (fresh(envelope)) void queryClient.invalidateQueries({ queryKey: queryKeys.noteOptions });
    },
    [SocketEvent.SETTINGS_UPDATED]: (
      envelope: EventEnvelope<SocketEventMap['settings.updated']>,
    ) => {
      if (fresh(envelope)) queryClient.setQueryData(queryKeys.settings, envelope.data.settings);
    },
  } satisfies { [E in SocketEvent]: (envelope: EventEnvelope<SocketEventMap[E]>) => void };

  // Tras una reconexión se perdieron eventos: se resincroniza todo por REST.
  const onReconnect = (): void => {
    void queryClient.invalidateQueries();
  };

  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event as SocketEvent, handler);
  }
  socket.io.on('reconnect', onReconnect);
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      socket.off(event as SocketEvent, handler);
    }
    socket.io.off('reconnect', onReconnect);
  };
}

/** Tiempo en segundo plano a partir del cual, al volver, se reconecta y se recarga todo. */
export const RESUME_AFTER_MS = 10_000;

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface ResumeSyncOptions {
  socket: Pick<KarbonSocket, 'connected' | 'connect' | 'disconnect'>;
  queryClient: Pick<QueryClient, 'invalidateQueries'>;
  hasSession: () => boolean;
  doc?: Listenable & Pick<Document, 'visibilityState'>;
  win?: Listenable;
  now?: () => number;
}

/**
 * iOS suspende la app en segundo plano (pantalla bloqueada, otra app) y el socket puede quedar
 * "conectado" sin estarlo hasta que venza el ping (~45 s). Al volver después de un rato, al
 * recuperar la red (cambio de Wi-Fi) o al restaurar la página, se reconecta de inmediato y se
 * recarga el estado por REST: el mesero nunca ve la mesa como estaba hace un minuto.
 */
export function bindResumeSync({
  socket,
  queryClient,
  hasSession,
  doc = document,
  win = window,
  now = Date.now,
}: ResumeSyncOptions): () => void {
  let hiddenAt: number | null = null;
  const resume = (): void => {
    if (!hasSession()) return;
    socket.disconnect();
    socket.connect();
    void queryClient.invalidateQueries();
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') {
      hiddenAt = now();
      return;
    }
    const away = hiddenAt === null ? 0 : now() - hiddenAt;
    hiddenAt = null;
    if (away >= RESUME_AFTER_MS || !socket.connected) resume();
  };
  const onOnline = (): void => {
    if (!socket.connected) resume();
  };
  const onPageShow = (event: Event): void => {
    if ((event as PageTransitionEvent).persisted) resume();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('online', onOnline);
  win.addEventListener('pageshow', onPageShow);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('online', onOnline);
    win.removeEventListener('pageshow', onPageShow);
  };
}

/** Escucha un evento del servidor mientras el componente esté montado (sonidos, avisos). */
export function useSocketEvent<E extends SocketEvent>(
  event: E,
  handler: (data: SocketEventMap[E]) => void,
): void {
  const { socket } = useKarbon();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (envelope: EventEnvelope<SocketEventMap[E]>): void => {
      latest.current(envelope.data);
    };
    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [socket, event]);
}

/** Estado de la conexión en tiempo real para el indicador de la interfaz. */
export function useRealtimeConnected(): boolean {
  const { socket } = useKarbon();
  return useSyncExternalStore(
    (onChange) => {
      socket.on('connect', onChange);
      socket.on('disconnect', onChange);
      return () => {
        socket.off('connect', onChange);
        socket.off('disconnect', onChange);
      };
    },
    () => socket.connected,
  );
}
