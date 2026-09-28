import type { IsoDateTime, MinorUnits, TableDto } from '@karbon/types';

export interface TableSummary {
  total: MinorUnits;
  guests: number;
  pendingTickets: number;
  /** Apertura del pedido más antiguo; `null` si la mesa no tiene pedidos activos. */
  openedAt: IsoDateTime | null;
}

/** Totales de las cuentas abiertas de una mesa, para el plano, las tarjetas y los celulares. */
export function summarizeTable(table: Pick<TableDto, 'activeOrders'>): TableSummary {
  let total = 0;
  let guests = 0;
  let pendingTickets = 0;
  let openedAt: IsoDateTime | null = null;
  for (const order of table.activeOrders) {
    total += order.total;
    guests += order.guests ?? 0;
    pendingTickets += order.pendingTickets;
    if (openedAt === null || order.createdAt < openedAt) openedAt = order.createdAt;
  }
  return { total, guests, pendingTickets, openedAt };
}
