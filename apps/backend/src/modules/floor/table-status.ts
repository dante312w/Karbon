import {
  KitchenTicketStatus,
  OrderStatus,
  TableStatus,
  type KitchenTicketStatus as TicketStatus,
  type OrderStatus as OrderStatusValue,
} from '@karbon/types';

export interface ActiveOrderSnapshot {
  status: OrderStatusValue;
  tickets: { status: TicketStatus }[];
}

const ACTIVE_ORDER: readonly OrderStatusValue[] = [OrderStatus.OPEN, OrderStatus.BILL_REQUESTED];
const IN_PREPARATION: readonly TicketStatus[] = [
  KitchenTicketStatus.NEW,
  KitchenTicketStatus.PREPARING,
  KitchenTicketStatus.READY,
];

export function isActiveOrder(status: OrderStatusValue): boolean {
  return ACTIVE_ORDER.includes(status);
}

/**
 * Estado de una mesa a partir de sus pedidos activos. Sin pedidos activos, PAGADA y
 * RESERVADA se conservan hasta que alguien libere la mesa: son estados manuales.
 */
export function deriveTableStatus(
  current: TableStatus,
  orders: readonly ActiveOrderSnapshot[],
): TableStatus {
  const active = orders.filter((order) => isActiveOrder(order.status));
  if (active.length === 0) {
    return current === TableStatus.PAID || current === TableStatus.RESERVED
      ? current
      : TableStatus.FREE;
  }
  if (active.some((order) => order.status === OrderStatus.BILL_REQUESTED))
    return TableStatus.WAITING_BILL;
  const preparing = active.some((order) =>
    order.tickets.some((ticket) => IN_PREPARATION.includes(ticket.status)),
  );
  return preparing ? TableStatus.WAITING_FOOD : TableStatus.OCCUPIED;
}
