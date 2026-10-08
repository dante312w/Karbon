import type { CashMovementDto, CashSessionDto, ExpenseDto, PaymentDto } from '@karbon/types';
import type { CashMovement, Expense, Payment, Prisma } from '../../generated/prisma/client.js';
import { iso, isoOrNull, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';

export const SESSION_INCLUDE = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
} satisfies Prisma.CashSessionInclude;

export type SessionWithUsers = Prisma.CashSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

function minorOrNull(value: Prisma.Decimal | null, currency: string): number | null {
  return value === null ? null : decimalToMinor(value, currency);
}

export function toCashSessionDto(session: SessionWithUsers, currency: string): CashSessionDto {
  return {
    id: session.id,
    status: session.status,
    openedBy: session.openedBy,
    closedBy: session.closedBy,
    openingAmount: decimalToMinor(session.openingAmount, currency),
    expectedCash: minorOrNull(session.expectedCash, currency),
    countedCash: minorOrNull(session.countedCash, currency),
    difference: minorOrNull(session.difference, currency),
    notes: session.notes,
    openedAt: iso(session.openedAt),
    closedAt: isoOrNull(session.closedAt),
  };
}

export function toPaymentDto(payment: Payment, currency: string): PaymentDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    cashSessionId: payment.cashSessionId,
    receivedById: payment.receivedById,
    method: payment.method,
    status: payment.status,
    amount: decimalToMinor(payment.amount, currency),
    tendered: minorOrNull(payment.tendered, currency),
    change: minorOrNull(payment.change, currency),
    reference: payment.reference,
    createdAt: iso(payment.createdAt),
    voidedAt: isoOrNull(payment.voidedAt),
  };
}

export function toCashMovementDto(movement: CashMovement, currency: string): CashMovementDto {
  return {
    id: movement.id,
    cashSessionId: movement.cashSessionId,
    userId: movement.userId,
    type: movement.type,
    amount: decimalToMinor(movement.amount, currency),
    description: movement.description,
    createdAt: iso(movement.createdAt),
  };
}

export function toExpenseDto(expense: Expense, currency: string): ExpenseDto {
  return {
    id: expense.id,
    category: expense.category,
    description: expense.description,
    amount: decimalToMinor(expense.amount, currency),
    paymentMethod: expense.paymentMethod,
    supplierId: expense.supplierId,
    cashSessionId: expense.cashSessionId,
    userId: expense.userId,
    reference: expense.reference,
    incurredAt: iso(expense.incurredAt),
    ...timestamps(expense),
  };
}
