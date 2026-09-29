/**
 * Catálogos de valores compartidos entre backend y clientes.
 * Cada uno debe coincidir 1:1 con su enum de Prisma; el backend lo verifica en
 * tiempo de compilación (apps/backend/src/common/contracts.check.ts).
 */

export type EnumValue<T> = T[keyof T];

function createEnum<const T extends readonly string[]>(
  values: T,
): { readonly [K in T[number]]: K } {
  // Object.fromEntries pierde la relación clave→valor; el tipo de retorno la restituye.
  return Object.freeze(Object.fromEntries(values.map((value) => [value, value]))) as {
    readonly [K in T[number]]: K;
  };
}

/**
 * Modo de operación del negocio. En `BAR` la barra reemplaza a la cocina: todas las comandas
 * van a la estación BAR y la interfaz habla de "barra" en lugar de "cocina".
 */
export const BusinessMode = createEnum(['RESTAURANT', 'BAR']);
export type BusinessMode = EnumValue<typeof BusinessMode>;

/** Roles de sistema creados por el seed. Los roles personalizados usan códigos propios. */
export const SystemRole = createEnum(['ADMIN', 'CASHIER', 'WAITER', 'KITCHEN']);
export type SystemRole = EnumValue<typeof SystemRole>;

export const TableStatus = createEnum([
  'FREE',
  'OCCUPIED',
  'WAITING_FOOD',
  'WAITING_BILL',
  'PAID',
  'RESERVED',
]);
export type TableStatus = EnumValue<typeof TableStatus>;

export const TableShape = createEnum(['SQUARE', 'ROUND', 'RECTANGLE']);
export type TableShape = EnumValue<typeof TableShape>;

/** Elementos fijos del plano del salón. */
export const FloorElementKind = createEnum([
  'BAR',
  'KITCHEN',
  'RESTROOM',
  'ENTRANCE',
  'CASHIER',
  'WALL',
]);
export type FloorElementKind = EnumValue<typeof FloorElementKind>;

export const ReservationStatus = createEnum([
  'PENDING',
  'CONFIRMED',
  'SEATED',
  'CANCELLED',
  'NO_SHOW',
]);
export type ReservationStatus = EnumValue<typeof ReservationStatus>;

export const OrderType = createEnum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
export type OrderType = EnumValue<typeof OrderType>;

/** Estado comercial del pedido. El avance en cocina vive en `KitchenTicketStatus`. */
export const OrderStatus = createEnum(['OPEN', 'BILL_REQUESTED', 'PAID', 'CANCELLED']);
export type OrderStatus = EnumValue<typeof OrderStatus>;

/** PENDING = en borrador (aún no enviado); SENT = enviado a cocina o servido directo. */
export const OrderItemStatus = createEnum(['PENDING', 'SENT', 'CANCELLED']);
export type OrderItemStatus = EnumValue<typeof OrderItemStatus>;

export const KitchenStation = createEnum(['KITCHEN', 'BAR']);
export type KitchenStation = EnumValue<typeof KitchenStation>;

export const KitchenTicketStatus = createEnum([
  'NEW',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED',
]);
export type KitchenTicketStatus = EnumValue<typeof KitchenTicketStatus>;

/** A quién va un llamado interno: al mesero (desde cocina, barra o caja) o a caja (desde el mesero). */
export const StaffCallTarget = createEnum(['WAITER', 'CASHIER']);
export type StaffCallTarget = EnumValue<typeof StaffCallTarget>;

/** Motivo de un llamado. Cada destino admite los suyos (`STAFF_CALL_REASONS` en @karbon/utils). */
export const StaffCallReason = createEnum([
  'TABLE_ATTENTION',
  'COME_OVER',
  'CHARGE_TABLE',
  'ACCOUNT_HELP',
  'CUSTOMER_ATTENTION',
]);
export type StaffCallReason = EnumValue<typeof StaffCallReason>;

/** PENDING → ACKNOWLEDGED ("Voy") → RESOLVED; quien llama puede cancelarlo mientras siga abierto. */
export const StaffCallStatus = createEnum(['PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED']);
export type StaffCallStatus = EnumValue<typeof StaffCallStatus>;

/** "Mixto" no es un método: es un pedido con varios pagos de métodos distintos. */
export const PaymentMethod = createEnum(['CASH', 'CARD', 'TRANSFER', 'QR']);
export type PaymentMethod = EnumValue<typeof PaymentMethod>;

export const PaymentStatus = createEnum(['COMPLETED', 'VOIDED']);
export type PaymentStatus = EnumValue<typeof PaymentStatus>;

export const CashSessionStatus = createEnum(['OPEN', 'CLOSED']);
export type CashSessionStatus = EnumValue<typeof CashSessionStatus>;

/** Movimientos de efectivo que no son ventas ni gastos (base adicional, retiros parciales). */
export const CashMovementType = createEnum(['INCOME', 'WITHDRAWAL']);
export type CashMovementType = EnumValue<typeof CashMovementType>;

export const MeasureUnit = createEnum(['UNIT', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER']);
export type MeasureUnit = EnumValue<typeof MeasureUnit>;

export const InventoryMovementType = createEnum([
  'PURCHASE',
  'ENTRY',
  'EXIT',
  'WASTE',
  'SALE',
  'SALE_REVERSAL',
  'ADJUSTMENT',
]);
export type InventoryMovementType = EnumValue<typeof InventoryMovementType>;

export const PurchaseStatus = createEnum(['DRAFT', 'RECEIVED', 'CANCELLED']);
export type PurchaseStatus = EnumValue<typeof PurchaseStatus>;

export const TaxKind = createEnum(['VAT', 'CONSUMPTION', 'OTHER']);
export type TaxKind = EnumValue<typeof TaxKind>;

export const IdentityDocumentType = createEnum(['CC', 'NIT', 'CE', 'TI', 'PASSPORT', 'FOREIGN_ID']);
export type IdentityDocumentType = EnumValue<typeof IdentityDocumentType>;

/** Tipos de documento emitibles; los proveedores fiscales (p. ej. DIAN) se conectan por adaptador. */
export const FiscalDocumentType = createEnum([
  'RECEIPT',
  'POS_EQUIVALENT',
  'INVOICE',
  'ELECTRONIC_INVOICE',
  'CREDIT_NOTE',
]);
export type FiscalDocumentType = EnumValue<typeof FiscalDocumentType>;

export const InvoiceStatus = createEnum([
  'ISSUED',
  'PENDING_SUBMISSION',
  'ACCEPTED',
  'REJECTED',
  'VOIDED',
]);
export type InvoiceStatus = EnumValue<typeof InvoiceStatus>;

export const PrinterKind = createEnum(['THERMAL', 'STANDARD']);
export type PrinterKind = EnumValue<typeof PrinterKind>;

export const PrinterConnection = createEnum(['USB', 'NETWORK', 'SYSTEM']);
export type PrinterConnection = EnumValue<typeof PrinterConnection>;

export const PrinterPurpose = createEnum(['RECEIPT', 'KITCHEN', 'BAR', 'DOCUMENT']);
export type PrinterPurpose = EnumValue<typeof PrinterPurpose>;
