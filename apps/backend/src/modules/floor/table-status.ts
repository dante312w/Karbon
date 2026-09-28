import { type KitchenTicketStatus, OrderStatus, TableStatus } from '@karbon/types';
import { isOrderActive, isTicketOpen } from '@karbon/utils';

export interface ActiveOrderSnapshot {
  status: OrderStatus;
  tickets: { status: KitchenTicketStatus }[];
}

/**
 * Estado de una mesa a partir de sus pedidos activos. Sin pedidos activos, PAGADA y
 * RESERVADA se conservan hasta que alguien libere la mesa: son estados manuales.
 */
export function deriveTableStatus(
  current: TableStatus,
  orders: readonly ActiveOrderSnapshot[],
): TableStatus {
  const active = orders.filter((order) => isOrderActive(order.status));
  if (active.length === 0) {
    return current === TableStatus.PAID || current === TableStatus.RESERVED
      ? current
      : TableStatus.FREE;
  }
  if (active.some((order) => order.status === OrderStatus.BILL_REQUESTED))
    return TableStatus.WAITING_BILL;
  const preparing = active.some((order) =>
    order.tickets.some((ticket) => isTicketOpen(ticket.status)),
  );
  return preparing ? TableStatus.WAITING_FOOD : TableStatus.OCCUPIED;
}
