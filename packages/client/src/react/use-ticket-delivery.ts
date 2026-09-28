import type { OrderDto } from '@karbon/types';
import { useApi } from './context';
import { useOrderMutation } from './use-order-mutation';

interface DeliveryCallbacks {
  onDelivered?: (order: OrderDto, ticketId: string) => void;
  onUndone?: (order: OrderDto, ticketId: string) => void;
  onError?: (error: Error) => void;
}

/** Confirmar (o deshacer) la entrega de las comandas de un pedido, desde el celular o el POS. */
export function useTicketDelivery(orderId: string, callbacks: DeliveryCallbacks = {}) {
  const api = useApi();
  const deliver = useOrderMutation(
    orderId,
    (_order, ticketId: string) => api.orders.deliverTicket(orderId, ticketId),
    {
      onSuccess: (order, ticketId) => callbacks.onDelivered?.(order, ticketId),
      onError: (error) => callbacks.onError?.(error),
    },
  );
  const undo = useOrderMutation(
    orderId,
    (_order, ticketId: string) => api.orders.undeliverTicket(orderId, ticketId),
    {
      onSuccess: (order, ticketId) => callbacks.onUndone?.(order, ticketId),
      onError: (error) => callbacks.onError?.(error),
    },
  );
  return { deliver, undo };
}
