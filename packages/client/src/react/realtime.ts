import type { QueryClient } from '@tanstack/react-query';
import {
  type EventEnvelope,
  type KitchenTicketDto,
  type OrderDto,
  type Paginated,
  SocketEvent,
  type SocketEventMap,
  type TableDto,
} from '@karbon/types';
import { isOrderActive } from '@karbon/utils';
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

  const handlers = {
    [SocketEvent.ORDER_CREATED]: onOrder,
    [SocketEvent.ORDER_UPDATED]: onOrder,
    [SocketEvent.TABLE_CHANGED]: onTable,
    [SocketEvent.KITCHEN_READY]: onTicket,
    [SocketEvent.KITCHEN_DELIVERED]: onTicket,
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
