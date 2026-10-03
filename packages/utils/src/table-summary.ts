import type { IsoDateTime, MinorUnits, TableDto } from '@karbon/types';

export interface TableSummary {
  total: MinorUnits;
  guests: number;
  pendingTickets: number;
  /** Comandas listas para llevar a la mesa, sumando todas sus cuentas. */
  readyTickets: number;
  /** Comanda más antigua aún en cocina; `null` si no hay nada preparándose. */
  preparingSince: IsoDateTime | null;
  itemCount: number;
  /** Apertura del pedido más antiguo; `null` si la mesa no tiene pedidos activos. */
  openedAt: IsoDateTime | null;
}

const earliest = (a: IsoDateTime | null, b: IsoDateTime | null): IsoDateTime | null =>
  a === null ? b : b === null || a < b ? a : b;

/** Totales de las cuentas abiertas de una mesa, para el plano, las tarjetas y los celulares. */
export function summarizeTable(table: Pick<TableDto, 'activeOrders'>): TableSummary {
  const summary: TableSummary = {
    total: 0,
    guests: 0,
    pendingTickets: 0,
    readyTickets: 0,
    preparingSince: null,
    itemCount: 0,
    openedAt: null,
  };
  for (const order of table.activeOrders) {
    summary.total += order.total;
    summary.guests += order.guests ?? 0;
    summary.pendingTickets += order.pendingTickets;
    summary.readyTickets += order.readyTickets;
    summary.itemCount += order.itemCount;
    summary.preparingSince = earliest(summary.preparingSince, order.preparingSince);
    summary.openedAt = earliest(summary.openedAt, order.createdAt);
  }
  return summary;
}
