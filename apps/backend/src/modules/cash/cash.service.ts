import { Injectable } from '@nestjs/common';
import {
  CashMovementType,
  type CashMovementDto,
  type CashSessionDto,
  type CashSessionSummaryDto,
  CashSessionStatus,
  ErrorCode,
  type ExpenseDto,
  OrderStatus,
  type Paginated,
  PaymentMethod,
  PaymentStatus,
  SocketEvent,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import { dateRange, pageArgs, paginated } from '../../common/http/pagination.js';
import { decimalToMinor, minorToDecimal } from '../../common/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db, Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { ACTIVE_ORDER_STATUSES } from '../floor/floor.constants.js';
import { DomainEventsService } from '../realtime/domain-events.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CloseCashSessionDto,
  CreateCashMovementDto,
  CreateExpenseDto,
  ExpenseQueryDto,
  OpenCashSessionDto,
} from './cash.dto.js';
import {
  SESSION_INCLUDE,
  toCashMovementDto,
  toCashSessionDto,
  toExpenseDto,
} from './cash.mapper.js';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly domainEvents: DomainEventsService,
    private readonly audit: AuditService,
  ) {}

  async requireOpenSession(db: Db): Promise<{ id: string }> {
    const session = await db.cashSession.findFirst({
      where: { status: CashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!session) throw conflict(ErrorCode.CASH_SESSION_REQUIRED, 'Abre la caja antes de cobrar');
    return session;
  }

  async current(): Promise<CashSessionSummaryDto | null> {
    const session = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.OPEN },
    });
    return session ? this.summary(session.id) : null;
  }

  async open(dto: OpenCashSessionDto, user: AuthenticatedUser): Promise<CashSessionSummaryDto> {
    const currency = await this.settings.currency();
    try {
      const session = await this.prisma.cashSession.create({
        data: {
          openedById: user.id,
          openingAmount: minorToDecimal(dto.openingAmount, currency),
          notes: dto.notes ?? null,
        },
      });
      await this.audit.log({
        userId: user.id,
        action: 'cash.open',
        entity: 'cash_session',
        entityId: session.id,
        metadata: { openingAmount: dto.openingAmount },
      });
      return await this.summary(session.id);
    } catch (error) {
      // El índice parcial único garantiza una sola caja abierta incluso con dos clics simultáneos.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict(ErrorCode.CASH_SESSION_ALREADY_OPEN, 'Ya hay una caja abierta');
      }
      throw error;
    }
  }

  async summary(sessionId: string, db: Db = this.prisma): Promise<CashSessionSummaryDto> {
    const currency = await this.settings.currency();
    const session = await db.cashSession.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw notFound('La sesión de caja');
    const totals = await this.computeTotals(db, sessionId);
    const openOrders = await db.order.count({
      where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
    });
    const expected = session.openingAmount
      .add(totals.cashSales)
      .add(totals.incomes)
      .sub(totals.withdrawals)
      .sub(totals.cashExpenses);
    const minor = (value: Prisma.Decimal): number => decimalToMinor(value, currency);
    return {
      session: toCashSessionDto(session, currency),
      salesTotal: minor(totals.salesTotal),
      ordersPaid: totals.ordersPaid,
      byMethod: totals.byMethod.map((row) => ({
        method: row.method,
        amount: minor(row.amount),
        count: row.count,
      })),
      cashSales: minor(totals.cashSales),
      incomes: minor(totals.incomes),
      withdrawals: minor(totals.withdrawals),
      cashExpenses: minor(totals.cashExpenses),
      expectedCash: session.expectedCash ? minor(session.expectedCash) : minor(expected),
      openOrders,
    };
  }

  async close(
    sessionId: string,
    dto: CloseCashSessionDto,
    user: AuthenticatedUser,
  ): Promise<CashSessionSummaryDto> {
    const currency = await this.settings.currency();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM cash_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      const session = await tx.cashSession.findUnique({ where: { id: sessionId } });
      if (!session) throw notFound('La sesión de caja');
      if (session.status !== CashSessionStatus.OPEN) {
        throw conflict(ErrorCode.INVALID_STATUS_TRANSITION, 'La caja ya está cerrada');
      }
      const totals = await this.computeTotals(tx, sessionId);
      const expected = session.openingAmount
        .add(totals.cashSales)
        .add(totals.incomes)
        .sub(totals.withdrawals)
        .sub(totals.cashExpenses);
      const counted = minorToDecimal(dto.countedCash, currency);
      await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: CashSessionStatus.CLOSED,
          closedAt: new Date(),
          closedById: user.id,
          expectedCash: expected,
          countedCash: counted,
          difference: counted.sub(expected),
          notes: dto.notes ?? session.notes,
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'cash.close',
          entity: 'cash_session',
          entityId: sessionId,
          metadata: { expected: decimalToMinor(expected, currency), counted: dto.countedCash },
        },
        tx,
      );
    });
    const result = await this.summary(sessionId);
    this.events.publish(
      SocketEvent.CASH_CLOSED,
      { session: result.session },
      EVENT_ROOMS.cashClosed,
    );
    this.domainEvents.emit('cash.closed', { sessionId });
    return result;
  }

  async listSessions(query: {
    page: number;
    pageSize: number;
  }): Promise<Paginated<CashSessionDto>> {
    const currency = await this.settings.currency();
    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        include: SESSION_INCLUDE,
        orderBy: { openedAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.cashSession.count(),
    ]);
    return paginated(
      sessions.map((session) => toCashSessionDto(session, currency)),
      total,
      query,
    );
  }

  async addMovement(dto: CreateCashMovementDto, user: AuthenticatedUser): Promise<CashMovementDto> {
    const currency = await this.settings.currency();
    const session = await this.requireOpenSession(this.prisma);
    const movement = await this.prisma.cashMovement.create({
      data: {
        cashSessionId: session.id,
        userId: user.id,
        type: dto.type,
        amount: minorToDecimal(dto.amount, currency),
        description: dto.description,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: `cash.${dto.type.toLowerCase()}`,
      entity: 'cash_session',
      entityId: session.id,
      metadata: { amount: dto.amount, description: dto.description },
    });
    return toCashMovementDto(movement, currency);
  }

  async listMovements(sessionId: string): Promise<CashMovementDto[]> {
    const currency = await this.settings.currency();
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
    });
    return movements.map((movement) => toCashMovementDto(movement, currency));
  }

  // ─── Gastos ─────────────────────────────────────────────────────────────────

  async createExpense(dto: CreateExpenseDto, user: AuthenticatedUser): Promise<ExpenseDto> {
    const currency = await this.settings.currency();
    const fromDrawer = dto.paidFromCash === true && dto.paymentMethod === PaymentMethod.CASH;
    const session = fromDrawer ? await this.requireOpenSession(this.prisma) : null;
    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category.trim(),
        description: dto.description.trim(),
        amount: minorToDecimal(dto.amount, currency),
        paymentMethod: dto.paymentMethod,
        supplierId: dto.supplierId ?? null,
        cashSessionId: session?.id ?? null,
        userId: user.id,
        reference: dto.reference ?? null,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(),
      },
    });
    return toExpenseDto(expense, currency);
  }

  async listExpenses(query: ExpenseQueryDto): Promise<Paginated<ExpenseDto>> {
    const currency = await this.settings.currency();
    const where: Prisma.ExpenseWhereInput = {
      ...(query.cashSessionId ? { cashSessionId: query.cashSessionId } : {}),
      ...dateRange('incurredAt', query),
    };
    const [expenses, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, orderBy: { incurredAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.expense.count({ where }),
    ]);
    return paginated(
      expenses.map((expense) => toExpenseDto(expense, currency)),
      total,
      query,
    );
  }

  async deleteExpense(id: string, user: AuthenticatedUser): Promise<void> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { cashSession: true },
    });
    if (!expense) throw notFound('El gasto');
    if (expense.cashSession?.status === CashSessionStatus.CLOSED) {
      throw conflict(ErrorCode.CONFLICT, 'El gasto pertenece a una caja cerrada');
    }
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({
      userId: user.id,
      action: 'expense.delete',
      entity: 'expense',
      entityId: id,
    });
  }

  /** Consultas secuenciales: dentro de una transacción comparten una sola conexión. */
  private async computeTotals(db: Db | Tx, sessionId: string) {
    const byMethod = await db.payment.groupBy({
      by: ['method'],
      where: { cashSessionId: sessionId, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const movements = await db.cashMovement.groupBy({
      by: ['type'],
      where: { cashSessionId: sessionId },
      _sum: { amount: true },
    });
    const cashExpenses = await db.expense.aggregate({
      where: { cashSessionId: sessionId, paymentMethod: PaymentMethod.CASH },
      _sum: { amount: true },
    });
    const ordersPaid = await db.order.count({
      where: { cashSessionId: sessionId, status: OrderStatus.PAID },
    });
    const methods = byMethod.map((row) => ({
      method: row.method,
      amount: row._sum.amount ?? ZERO,
      count: row._count._all,
    }));
    const movementSum = (type: CashMovementType): Prisma.Decimal =>
      movements.find((row) => row.type === type)?._sum.amount ?? ZERO;
    return {
      byMethod: methods,
      salesTotal: methods.reduce((sum, row) => sum.add(row.amount), ZERO),
      cashSales: methods.find((row) => row.method === PaymentMethod.CASH)?.amount ?? ZERO,
      incomes: movementSum(CashMovementType.INCOME),
      withdrawals: movementSum(CashMovementType.WITHDRAWAL),
      cashExpenses: cashExpenses._sum.amount ?? ZERO,
      ordersPaid,
    };
  }
}
