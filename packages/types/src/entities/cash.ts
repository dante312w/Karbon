import type { IsoDateTime, MinorUnits, Timestamps, Uuid } from '../common.js';
import type {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
  PaymentStatus,
} from '../enums.js';

export interface PaymentDto {
  id: Uuid;
  orderId: Uuid;
  cashSessionId: Uuid;
  receivedById: Uuid;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: MinorUnits;
  /** Solo efectivo: lo que entregó el cliente y el cambio devuelto. */
  tendered: MinorUnits | null;
  change: MinorUnits | null;
  reference: string | null;
  createdAt: IsoDateTime;
  voidedAt: IsoDateTime | null;
}

export interface CashSessionDto {
  id: Uuid;
  status: CashSessionStatus;
  openedBy: { id: Uuid; name: string };
  closedBy: { id: Uuid; name: string } | null;
  openingAmount: MinorUnits;
  /** Se calculan al cerrar: esperado = base + efectivo cobrado + ingresos − retiros − gastos en efectivo. */
  expectedCash: MinorUnits | null;
  countedCash: MinorUnits | null;
  difference: MinorUnits | null;
  notes: string | null;
  openedAt: IsoDateTime;
  closedAt: IsoDateTime | null;
}

export interface CashMovementDto {
  id: Uuid;
  cashSessionId: Uuid;
  userId: Uuid;
  type: CashMovementType;
  amount: MinorUnits;
  description: string;
  createdAt: IsoDateTime;
}

export interface ExpenseDto extends Timestamps {
  id: Uuid;
  category: string;
  description: string;
  amount: MinorUnits;
  paymentMethod: PaymentMethod;
  supplierId: Uuid | null;
  /** Presente si el gasto se pagó con efectivo de la caja abierta. */
  cashSessionId: Uuid | null;
  userId: Uuid;
  reference: string | null;
  incurredAt: IsoDateTime;
}
