import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type OrderDto,
  OrderItemStatus,
  type Permission,
  SocketEvent,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import { minorToDecimal } from '../../common/money.js';
import type { Order } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { orderTotals } from './order-totals.js';
import { ORDER_INCLUDE, toOrderDto } from './orders.mapper.js';

export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  if (!user.permissions.includes(permission)) {
    throw new ForbiddenException('No tienes permiso para esta acción');
  }
}

/** Acceso transaccional a pedidos compartido por pedidos, cocina y pagos. */
@Injectable()
export class OrderStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  /**
   * Bloquea la fila del pedido durante la transacción y verifica la versión esperada:
   * dos terminales nunca pisan cambios ajenos sin enterarse.
   */
  async lock(tx: Tx, orderId: string, expectedVersion?: number): Promise<Order> {
    await tx.$executeRaw`SELECT 1 FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('El pedido');
    if (expectedVersion !== undefined && order.version !== expectedVersion) {
      throw conflict(
        ErrorCode.ORDER_VERSION_CONFLICT,
        'El pedido cambió en otra terminal; se recargó la última versión',
        { currentVersion: order.version },
      );
    }
    return order;
  }

  /** Recalcula totales y sube la versión. */
  async recalculate(tx: Tx, orderId: string): Promise<void> {
    const settings = await this.settings.get();
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { where: { status: { not: OrderItemStatus.CANCELLED } } } },
    });
    const totals = orderTotals(order.items, order.tipPercent, settings);
    const decimal = (amount: number) => minorToDecimal(amount, settings.currency);
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: decimal(totals.subtotal),
        discountTotal: decimal(totals.discountTotal),
        taxTotal: decimal(totals.taxTotal),
        tipAmount: decimal(totals.tipAmount),
        total: decimal(totals.total),
        version: { increment: 1 },
      },
    });
  }

  async load(orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw notFound('El pedido');
    return toOrderDto(order, await this.settings.currency());
  }

  publishUpdated(order: OrderDto): void {
    this.events.publish(SocketEvent.ORDER_UPDATED, { order }, EVENT_ROOMS.orderUpdated);
  }

  publishCreated(order: OrderDto): void {
    this.events.publish(SocketEvent.ORDER_CREATED, { order }, EVENT_ROOMS.orderCreated);
  }
}
