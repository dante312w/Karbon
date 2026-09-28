import { Injectable } from '@nestjs/common';
import {
  CashSessionStatus,
  ErrorCode,
  OrderStatus,
  type PaymentDto,
  PaymentMethod,
  type PaymentResultDto,
  PaymentStatus,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, invalid, notFound } from '../../common/errors/domain-error.js';
import { decimalToMinor, minorToDecimal } from '../../common/money.js';
import { Prisma, type Order } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { FloorService } from '../floor/floor.service.js';
import { StockService } from '../inventory/stock.service.js';
import { OrderStore } from '../orders/order-store.service.js';
import { assertOrderEditable } from '../orders/order-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import type { CreatePaymentDto, VoidPaymentDto } from './cash.dto.js';
import { toPaymentDto } from './cash.mapper.js';
import { CashService } from './cash.service.js';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OrderStore,
    private readonly cash: CashService,
    private readonly floor: FloorService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async listForOrder(orderId: string): Promise<PaymentDto[]> {
    const currency = await this.settings.currency();
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return payments.map((payment) => toPaymentDto(payment, currency));
  }

  /**
   * Registra un pago (varios pagos = pago mixto o cuenta dividida en partes). Al completar el
   * total: el pedido queda pagado, se descuenta el inventario por receta, se actualiza el
   * historial del cliente y la mesa pasa a "Pagada".
   */
  async pay(
    orderId: string,
    dto: CreatePaymentDto,
    user: AuthenticatedUser,
  ): Promise<PaymentResultDto> {
    const currency = await this.settings.currency();
    let changeMinor: number | null = null;
    let completed = false;
    let ingredientIds: string[] = [];

    const order = await this.prisma.$transaction(
      async (tx) => {
        const session = await this.cash.requireOpenSession(tx);
        const locked = await this.store.lock(tx, orderId);
        assertOrderEditable(locked.status);

        const paid = await this.paidAmount(tx, orderId);
        const pending = locked.total.sub(paid);
        const amount = minorToDecimal(dto.amount, currency);

        if (amount.isZero()) {
          if (!pending.isZero()) throw badRequest('El monto debe ser mayor que cero');
        } else {
          if (amount.gt(pending)) {
            throw conflict(ErrorCode.PAYMENT_EXCEEDS_BALANCE, 'El pago supera el saldo pendiente', {
              pending: decimalToMinor(pending, currency),
            });
          }
          let tendered: Prisma.Decimal | null = null;
          let change: Prisma.Decimal | null = null;
          if (dto.method === PaymentMethod.CASH) {
            tendered = minorToDecimal(dto.tendered ?? dto.amount, currency);
            if (tendered.lt(amount))
              throw invalid(ErrorCode.INSUFFICIENT_TENDERED, 'El efectivo recibido no alcanza');
            change = tendered.sub(amount);
            changeMinor = decimalToMinor(change, currency);
          }
          await tx.payment.create({
            data: {
              orderId,
              cashSessionId: session.id,
              receivedById: user.id,
              method: dto.method,
              amount,
              tendered,
              change,
              reference: dto.reference ?? null,
            },
          });
        }

        completed = paid.add(amount).gte(locked.total);
        if (completed) {
          ingredientIds = await this.complete(tx, locked, session.id, user);
        } else {
          await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
        }
        return locked;
      },
      { timeout: 20_000 },
    );

    const dtoOut = await this.store.load(orderId);
    this.store.publishUpdated(dtoOut);
    await this.floor.publishTables([order.tableId]);
    await this.stock.publish(ingredientIds);
    return { order: dtoOut, change: changeMinor, completed };
  }

  /** Anula un pago del turno abierto; si el pedido estaba pagado, lo reabre y repone inventario. */
  async void(
    paymentId: string,
    dto: VoidPaymentDto,
    user: AuthenticatedUser,
  ): Promise<PaymentResultDto> {
    let ingredientIds: string[] = [];
    const target = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { orderId: true },
    });
    if (!target) throw notFound('El pago');
    const currency = await this.settings.currency();

    const order = await this.prisma.$transaction(
      async (tx) => {
        // Con el pedido bloqueado, dos anulaciones simultáneas del mismo pago no pasan ambas.
        const locked = await this.store.lock(tx, target.orderId);
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          include: { cashSession: { select: { status: true } } },
        });
        if (payment.status !== PaymentStatus.COMPLETED)
          throw conflict(ErrorCode.CONFLICT, 'El pago ya fue anulado');
        if (payment.cashSession.status !== CashSessionStatus.OPEN) {
          throw conflict(ErrorCode.CONFLICT, 'Solo se anulan pagos de la caja abierta');
        }
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.VOIDED,
            voidedAt: new Date(),
            voidReason: dto.reason,
            voidedById: user.id,
          },
        });
        if (locked.status === OrderStatus.PAID) {
          await tx.order.update({
            where: { id: locked.id },
            data: {
              status: OrderStatus.BILL_REQUESTED,
              closedAt: null,
              cashSessionId: null,
              version: { increment: 1 },
            },
          });
          ingredientIds = await this.stock.reverseSale(tx, locked.id, locked.number, user.id);
          if (locked.customerId) {
            await tx.customer.update({
              where: { id: locked.customerId },
              data: { visitsCount: { decrement: 1 }, totalSpent: { decrement: locked.total } },
            });
          }
          await this.floor.refreshStatuses(tx, [locked.tableId]);
        } else {
          await tx.order.update({ where: { id: locked.id }, data: { version: { increment: 1 } } });
        }
        await this.audit.log(
          {
            userId: user.id,
            action: 'payment.void',
            entity: 'payment',
            entityId: paymentId,
            metadata: {
              orderId: locked.id,
              reason: dto.reason,
              amount: decimalToMinor(payment.amount, currency),
            },
          },
          tx,
        );
        return locked;
      },
      { timeout: 20_000 },
    );

    const dtoOut = await this.store.load(order.id);
    this.store.publishUpdated(dtoOut);
    await this.floor.publishTables([order.tableId]);
    await this.stock.publish(ingredientIds);
    return { order: dtoOut, change: null, completed: false };
  }

  private async paidAmount(tx: Tx, orderId: string): Promise<Prisma.Decimal> {
    const result = await tx.payment.aggregate({
      where: { orderId, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    });
    return result._sum.amount ?? ZERO;
  }

  private async complete(
    tx: Tx,
    order: Order,
    sessionId: string,
    user: AuthenticatedUser,
  ): Promise<string[]> {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        closedAt: new Date(),
        cashSessionId: sessionId,
        version: { increment: 1 },
      },
    });
    const ingredientIds = await this.stock.applySale(tx, order.id, order.number, user.id);
    if (order.customerId) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          visitsCount: { increment: 1 },
          totalSpent: { increment: order.total },
          lastVisitAt: new Date(),
        },
      });
    }
    const otherActive = order.tableId
      ? (await this.floor.activeOrderIds(tx, order.tableId)).filter((id) => id !== order.id)
      : [];
    // La mesa queda "Pagada" (por limpiar) solo si no quedan otras cuentas abiertas en ella.
    await this.floor.refreshStatuses(
      tx,
      [order.tableId],
      order.tableId && otherActive.length === 0 ? [order.tableId] : [],
    );
    return ingredientIds;
  }
}
