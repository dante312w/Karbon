import type { KitchenTicketDto, OrderDto, OrderItemDto } from '@karbon/types';
import { PaymentStatus } from '@karbon/types';
import type { OrderItem, Prisma } from '../../generated/prisma/client.js';
import { iso, isoOrNull, num, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';

const TICKET_ITEM_SELECT = {
  id: true,
  productName: true,
  quantity: true,
  notes: true,
  status: true,
} satisfies Prisma.OrderItemSelect;

export const ORDER_INCLUDE = {
  table: { select: { id: true, name: true } },
  waiter: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  tickets: {
    orderBy: [{ sequence: 'asc' }, { station: 'asc' }],
    include: { items: { select: TICKET_ITEM_SELECT, orderBy: { sortOrder: 'asc' } } },
  },
  payments: { where: { status: PaymentStatus.COMPLETED }, select: { amount: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export const TICKET_INCLUDE = {
  items: { select: TICKET_ITEM_SELECT, orderBy: { sortOrder: 'asc' } },
  order: {
    select: {
      number: true,
      label: true,
      waiterId: true,
      table: { select: { name: true } },
      waiter: { select: { name: true } },
    },
  },
} satisfies Prisma.KitchenTicketInclude;

export type TicketWithRelations = Prisma.KitchenTicketGetPayload<{
  include: typeof TICKET_INCLUDE;
}>;

type TicketCore = Omit<TicketWithRelations, 'order'>;

interface TicketContext {
  number: number;
  label: string | null;
  tableName: string | null;
  waiterName: string;
}

export function toTicketDto(ticket: TicketCore, context: TicketContext): KitchenTicketDto {
  return {
    id: ticket.id,
    orderId: ticket.orderId,
    orderNumber: context.number,
    // En barra o para llevar no hay mesa: se muestra el nombre de la cuenta.
    tableName: context.tableName ?? context.label,
    waiterName: context.waiterName,
    sequence: ticket.sequence,
    station: ticket.station,
    status: ticket.status,
    notes: ticket.notes,
    items: ticket.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status,
    })),
    createdAt: iso(ticket.createdAt),
    startedAt: isoOrNull(ticket.startedAt),
    readyAt: isoOrNull(ticket.readyAt),
    deliveredAt: isoOrNull(ticket.deliveredAt),
  };
}

export function toTicketDtoWithOrder(ticket: TicketWithRelations): KitchenTicketDto {
  return toTicketDto(ticket, {
    number: ticket.order.number,
    label: ticket.order.label,
    tableName: ticket.order.table?.name ?? null,
    waiterName: ticket.order.waiter.name,
  });
}

function toItemDto(item: OrderItem, currency: string): OrderItemDto {
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    ticketId: item.ticketId,
    status: item.status,
    productName: item.productName,
    unitPrice: decimalToMinor(item.unitPrice, currency),
    quantity: item.quantity,
    taxRate: num(item.taxRate),
    discount: decimalToMinor(item.discount, currency),
    total: decimalToMinor(item.total, currency),
    notes: item.notes,
    sortOrder: item.sortOrder,
    cancelledAt: isoOrNull(item.cancelledAt),
    cancelReason: item.cancelReason,
    ...timestamps(item),
  };
}

export function toOrderDto(order: OrderWithRelations, currency: string): OrderDto {
  const total = decimalToMinor(order.total, currency);
  const paidAmount = order.payments.reduce(
    (sum, payment) => sum + decimalToMinor(payment.amount, currency),
    0,
  );
  const context: TicketContext = {
    number: order.number,
    label: order.label,
    tableName: order.table?.name ?? null,
    waiterName: order.waiter.name,
  };
  return {
    id: order.id,
    number: order.number,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    tableName: order.table?.name ?? null,
    waiter: order.waiter,
    customerId: order.customerId,
    customerName: order.customer?.name ?? null,
    splitFromId: order.splitFromId,
    guests: order.guests,
    label: order.label,
    notes: order.notes,
    tipPercent: num(order.tipPercent),
    items: order.items.map((item) => toItemDto(item, currency)),
    tickets: order.tickets.map((ticket) => toTicketDto(ticket, context)),
    subtotal: decimalToMinor(order.subtotal, currency),
    discountTotal: decimalToMinor(order.discountTotal, currency),
    taxTotal: decimalToMinor(order.taxTotal, currency),
    tipAmount: decimalToMinor(order.tipAmount, currency),
    total,
    paidAmount,
    pendingAmount: Math.max(0, total - paidAmount),
    version: order.version,
    billRequestedAt: isoOrNull(order.billRequestedAt),
    closedAt: isoOrNull(order.closedAt),
    cancelledAt: isoOrNull(order.cancelledAt),
    cancelReason: order.cancelReason,
    ...timestamps(order),
  };
}
