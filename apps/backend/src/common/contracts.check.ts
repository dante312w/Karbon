import type * as Contracts from '@karbon/types';
import type * as Db from '../generated/prisma/enums.js';

/**
 * Verificación en tiempo de compilación: los enums de @karbon/types (lo que ven los clientes)
 * deben ser idénticos a los enums de Prisma (lo que guarda la base de datos). Si una migración
 * agrega un valor y el contrato no, `npm run typecheck` falla aquí.
 */
// Igualdad exacta de tipos: el parámetro genérico "sin uso" es intencional (difiere la evaluación).
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
type Assert<T extends true> = T;

export type EnumContractChecks = [
  Assert<Equals<Db.BusinessMode, Contracts.BusinessMode>>,
  Assert<Equals<Db.TableStatus, Contracts.TableStatus>>,
  Assert<Equals<Db.TableShape, Contracts.TableShape>>,
  Assert<Equals<Db.FloorElementKind, Contracts.FloorElementKind>>,
  Assert<Equals<Db.ReservationStatus, Contracts.ReservationStatus>>,
  Assert<Equals<Db.OrderType, Contracts.OrderType>>,
  Assert<Equals<Db.OrderStatus, Contracts.OrderStatus>>,
  Assert<Equals<Db.OrderItemStatus, Contracts.OrderItemStatus>>,
  Assert<Equals<Db.KitchenStation, Contracts.KitchenStation>>,
  Assert<Equals<Db.KitchenTicketStatus, Contracts.KitchenTicketStatus>>,
  Assert<Equals<Db.StaffCallTarget, Contracts.StaffCallTarget>>,
  Assert<Equals<Db.StaffCallReason, Contracts.StaffCallReason>>,
  Assert<Equals<Db.StaffCallStatus, Contracts.StaffCallStatus>>,
  Assert<Equals<Db.PaymentMethod, Contracts.PaymentMethod>>,
  Assert<Equals<Db.PaymentStatus, Contracts.PaymentStatus>>,
  Assert<Equals<Db.CashSessionStatus, Contracts.CashSessionStatus>>,
  Assert<Equals<Db.CashMovementType, Contracts.CashMovementType>>,
  Assert<Equals<Db.MeasureUnit, Contracts.MeasureUnit>>,
  Assert<Equals<Db.InventoryMovementType, Contracts.InventoryMovementType>>,
  Assert<Equals<Db.PurchaseStatus, Contracts.PurchaseStatus>>,
  Assert<Equals<Db.TaxKind, Contracts.TaxKind>>,
  Assert<Equals<Db.IdentityDocumentType, Contracts.IdentityDocumentType>>,
  Assert<Equals<Db.FiscalDocumentType, Contracts.FiscalDocumentType>>,
  Assert<Equals<Db.InvoiceStatus, Contracts.InvoiceStatus>>,
  Assert<Equals<Db.PrinterKind, Contracts.PrinterKind>>,
  Assert<Equals<Db.PrinterConnection, Contracts.PrinterConnection>>,
  Assert<Equals<Db.PrinterPurpose, Contracts.PrinterPurpose>>,
];
