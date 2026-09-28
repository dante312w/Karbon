import type { IsoDateTime, MinorUnits, Percentage, Timestamps, Uuid } from '../common.js';
import type {
  KitchenStation,
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
  OrderType,
} from '../enums.js';

export interface OrderItemDto extends Timestamps {
  id: Uuid;
  orderId: Uuid;
  productId: Uuid;
  ticketId: Uuid | null;
  status: OrderItemStatus;
  /** Nombre y precio congelados al momento de la venta. */
  productName: string;
  unitPrice: MinorUnits;
  quantity: number;
  taxRate: Percentage;
  discount: MinorUnits;
  total: MinorUnits;
  /** Instrucciones para cocina, p. ej. "sin cebolla, extra queso". */
  notes: string | null;
  sortOrder: number;
  cancelledAt: IsoDateTime | null;
  cancelReason: string | null;
}

/** Comanda: un envío a cocina/bar. El KDS trabaja sobre comandas, no sobre pedidos. */
export interface KitchenTicketDto {
  id: Uuid;
  orderId: Uuid;
  orderNumber: number;
  tableName: string | null;
  /** Mesero del pedido: es quien confirma la entrega (o alguien con `orders:manage_any`). */
  waiterId: Uuid;
  waiterName: string;
  /** Ronda de envío dentro del pedido (1, 2, 3…). */
  sequence: number;
  station: KitchenStation;
  status: KitchenTicketStatus;
  notes: string | null;
  items: Pick<OrderItemDto, 'id' | 'productName' | 'quantity' | 'notes' | 'status'>[];
  createdAt: IsoDateTime;
  startedAt: IsoDateTime | null;
  readyAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  /** Quién confirmó la entrega; `null` si la cerró el sistema al cobrar el pedido. */
  deliveredBy: { id: Uuid; name: string } | null;
}

export interface OrderTotals {
  subtotal: MinorUnits;
  discountTotal: MinorUnits;
  taxTotal: MinorUnits;
  tipAmount: MinorUnits;
  total: MinorUnits;
}

export interface OrderDto extends Timestamps, OrderTotals {
  id: Uuid;
  /** Número consecutivo legible (#1234). */
  number: number;
  type: OrderType;
  status: OrderStatus;
  tableId: Uuid | null;
  tableName: string | null;
  waiter: { id: Uuid; name: string };
  customerId: Uuid | null;
  customerName: string | null;
  splitFromId: Uuid | null;
  guests: number | null;
  /** Nombre de la cuenta cuando no hay mesa (barra, para llevar). */
  label: string | null;
  notes: string | null;
  tipPercent: Percentage;
  items: OrderItemDto[];
  tickets: KitchenTicketDto[];
  paidAmount: MinorUnits;
  /** total − pagado. */
  pendingAmount: MinorUnits;
  /** Versión para concurrencia optimista: se envía en cada modificación. */
  version: number;
  billRequestedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
  cancelledAt: IsoDateTime | null;
  cancelReason: string | null;
}
