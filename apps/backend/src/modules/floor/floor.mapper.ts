import {
  type AreaDto,
  type FloorElementDto,
  OrderItemStatus,
  type ReservationDto,
  type TableDto,
  type TableOrderSummary,
} from '@karbon/types';
import { ACTIVE_ORDER_STATUSES, isTicketOpen, summarizePreparation } from '@karbon/utils';
import type { FloorElement, Prisma, Reservation } from '../../generated/prisma/client.js';
import { decimalToMinor } from '../../common/money.js';
import { iso, timestamps } from '../../common/mapping.js';

export const TABLE_INCLUDE = {
  orders: {
    where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
    orderBy: { createdAt: 'asc' },
    include: {
      waiter: { select: { name: true } },
      tickets: { select: { status: true, createdAt: true } },
      items: { where: { status: { not: OrderItemStatus.CANCELLED } }, select: { quantity: true } },
    },
  },
} satisfies Prisma.DiningTableInclude;

export type TableWithOrders = Prisma.DiningTableGetPayload<{ include: typeof TABLE_INCLUDE }>;

export const AREA_INCLUDE = {
  elements: { orderBy: [{ posY: 'asc' }, { posX: 'asc' }] },
} satisfies Prisma.AreaInclude;

export type AreaWithElements = Prisma.AreaGetPayload<{ include: typeof AREA_INCLUDE }>;

export function toFloorElementDto(element: FloorElement): FloorElementDto {
  return {
    id: element.id,
    areaId: element.areaId,
    kind: element.kind,
    label: element.label,
    posX: element.posX,
    posY: element.posY,
    width: element.width,
    height: element.height,
  };
}

export function toAreaDto(area: AreaWithElements): AreaDto {
  return {
    id: area.id,
    name: area.name,
    sortOrder: area.sortOrder,
    isActive: area.isActive,
    elements: area.elements.map(toFloorElementDto),
    ...timestamps(area),
  };
}

export function toTableDto(table: TableWithOrders, currency: string): TableDto {
  const activeOrders: TableOrderSummary[] = table.orders.map((order) => ({
    id: order.id,
    number: order.number,
    status: order.status,
    total: decimalToMinor(order.total, currency),
    guests: order.guests,
    waiterId: order.waiterId,
    waiterName: order.waiter.name,
    pendingTickets: order.tickets.filter((ticket) => isTicketOpen(ticket.status)).length,
    ...summarizePreparation(
      order.tickets.map((ticket) => ({ status: ticket.status, createdAt: iso(ticket.createdAt) })),
    ),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: iso(order.createdAt),
  }));
  return {
    id: table.id,
    areaId: table.areaId,
    name: table.name,
    capacity: table.capacity,
    status: table.status,
    shape: table.shape,
    posX: table.posX,
    posY: table.posY,
    width: table.width,
    height: table.height,
    mergedIntoId: table.mergedIntoId,
    activeOrders,
    isActive: table.isActive,
    ...timestamps(table),
  };
}

export function toReservationDto(reservation: Reservation): ReservationDto {
  return {
    id: reservation.id,
    tableId: reservation.tableId,
    customerId: reservation.customerId,
    customerName: reservation.customerName,
    phone: reservation.phone,
    partySize: reservation.partySize,
    reservedFor: iso(reservation.reservedFor),
    durationMinutes: reservation.durationMinutes,
    status: reservation.status,
    notes: reservation.notes,
    ...timestamps(reservation),
  };
}
