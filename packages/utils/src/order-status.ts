import { KitchenTicketStatus, OrderStatus } from '@karbon/types';

/** Pedidos que ocupan una mesa y todavía admiten cambios. */
export const ACTIVE_ORDER_STATUSES = [OrderStatus.OPEN, OrderStatus.BILL_REQUESTED] as const;

/** Comandas que siguen en cocina/barra (aún no entregadas ni canceladas). */
export const OPEN_TICKET_STATUSES = [
  KitchenTicketStatus.NEW,
  KitchenTicketStatus.PREPARING,
  KitchenTicketStatus.READY,
] as const;

export function isOrderActive(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

export function isTicketOpen(status: KitchenTicketStatus): boolean {
  return (OPEN_TICKET_STATUSES as readonly KitchenTicketStatus[]).includes(status);
}
