import type {
  IsoDate,
  IsoDateTime,
  MinorUnits,
  Percentage,
  Quantity,
  UnitCost,
  Uuid,
} from '../common.js';
import type {
  CashMovementType,
  FiscalDocumentType,
  IdentityDocumentType,
  InventoryMovementType,
  KitchenStation,
  KitchenTicketStatus,
  OrderType,
  PaymentMethod,
} from '../enums.js';
import type { CashSessionDto } from '../entities/cash.js';
import type { OrderDto } from '../entities/orders.js';

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export interface OrderItemInput {
  productId: Uuid;
  quantity: number;
  notes?: string | null;
}

export interface CreateOrderRequest {
  /**
   * ID generado por el cliente (UUID v7). Permite crear pedidos sin conexión y reenviarlos
   * sin duplicarlos: si el pedido ya existe, se devuelve el existente.
   */
  id?: Uuid;
  type?: OrderType;
  tableId?: Uuid | null;
  label?: string | null;
  guests?: number | null;
  notes?: string | null;
  customerId?: Uuid | null;
  items?: OrderItemInput[];
  /** Envía de inmediato los ítems a cocina/barra. */
  send?: boolean;
}

/** Agregar es conmutativo: la versión es opcional para que las colas offline no choquen. */
export interface AddOrderItemsRequest {
  version?: number;
  items: OrderItemInput[];
  send?: boolean;
}

export interface VersionedRequest {
  version: number;
}

export interface UpdateOrderRequest extends VersionedRequest {
  guests?: number | null;
  label?: string | null;
  notes?: string | null;
  customerId?: Uuid | null;
  tipPercent?: Percentage;
}

export interface UpdateOrderItemRequest extends VersionedRequest {
  quantity?: number;
  notes?: string | null;
  discount?: MinorUnits;
}

export interface CancelRequest extends VersionedRequest {
  reason: string;
}

export interface ReorderItemsRequest extends VersionedRequest {
  itemIds: Uuid[];
}

export interface MoveOrderRequest extends VersionedRequest {
  tableId: Uuid;
}

export interface SplitOrderRequest extends VersionedRequest {
  items: { itemId: Uuid; quantity: number }[];
}

export interface DuplicateOrderRequest {
  tableId?: Uuid | null;
  label?: string | null;
}

export interface OrderListQuery {
  status?: 'ACTIVE' | 'PAID' | 'CANCELLED';
  tableId?: Uuid;
  waiterId?: Uuid;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}

// ─── Cocina / barra ──────────────────────────────────────────────────────────

export interface KitchenTicketQuery {
  station?: KitchenStation;
  /** Por defecto: comandas no entregadas + entregadas en los últimos 15 minutos. */
  includeDelivered?: boolean;
}

export interface UpdateTicketStatusRequest {
  status: KitchenTicketStatus;
}

// ─── Caja y pagos ────────────────────────────────────────────────────────────

export interface OpenCashSessionRequest {
  openingAmount: MinorUnits;
  notes?: string | null;
}

export interface CloseCashSessionRequest {
  countedCash: MinorUnits;
  notes?: string | null;
}

export interface CreateCashMovementRequest {
  type: CashMovementType;
  amount: MinorUnits;
  description: string;
}

export interface CreateExpenseRequest {
  category: string;
  description: string;
  amount: MinorUnits;
  paymentMethod: PaymentMethod;
  supplierId?: Uuid | null;
  /** Si es efectivo, ¿salió de la caja abierta? Descuenta del efectivo esperado. */
  paidFromCash?: boolean;
  reference?: string | null;
  incurredAt?: IsoDateTime;
}

export interface CreatePaymentRequest {
  method: PaymentMethod;
  amount: MinorUnits;
  /** Solo efectivo: lo entregado por el cliente (≥ amount). */
  tendered?: MinorUnits;
  reference?: string | null;
}

export interface VoidPaymentRequest {
  reason: string;
}

export interface PaymentMethodTotal {
  method: PaymentMethod;
  amount: MinorUnits;
  count: number;
}

export interface CashSessionSummaryDto {
  session: CashSessionDto;
  salesTotal: MinorUnits;
  ordersPaid: number;
  byMethod: PaymentMethodTotal[];
  cashSales: MinorUnits;
  incomes: MinorUnits;
  withdrawals: MinorUnits;
  cashExpenses: MinorUnits;
  /** base + efectivo cobrado + ingresos − retiros − gastos en efectivo. */
  expectedCash: MinorUnits;
  openOrders: number;
}

export interface PaymentResultDto {
  order: OrderDto;
  change: MinorUnits | null;
  completed: boolean;
}

// ─── Facturación ─────────────────────────────────────────────────────────────

export interface IssueInvoiceRequest {
  documentType?: FiscalDocumentType;
  customerId?: Uuid | null;
}

export interface PrintRequest {
  printerId: Uuid;
}

/** Modelo de presentación de un comprobante: lo usan el ticket ESC/POS, la vista A4 y el PDF. */
export interface ReceiptDocument {
  title: string;
  business: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    header: string | null;
    footer: string | null;
    logoUrl: string | null;
  };
  documentNumber: string | null;
  issuedAt: IsoDateTime;
  orderNumber: number;
  tableName: string | null;
  label: string | null;
  waiterName: string;
  cashierName: string | null;
  customer: { name: string; document: string | null } | null;
  lines: {
    quantity: number;
    description: string;
    unitPrice: MinorUnits;
    total: MinorUnits;
    notes: string | null;
  }[];
  subtotal: MinorUnits;
  discountTotal: MinorUnits;
  taxes: { name: string; rate: Percentage; base: MinorUnits; amount: MinorUnits }[];
  tipAmount: MinorUnits;
  total: MinorUnits;
  payments: {
    method: PaymentMethod;
    amount: MinorUnits;
    tendered: MinorUnits | null;
    change: MinorUnits | null;
  }[];
  currency: string;
  locale: string;
  fiscalCode: string | null;
  qrData: string | null;
}

// ─── Inventario ──────────────────────────────────────────────────────────────

export interface CreateIngredientRequest {
  name: string;
  sku?: string | null;
  unit: 'UNIT' | 'GRAM' | 'KILOGRAM' | 'MILLILITER' | 'LITER';
  minStock?: Quantity;
  /** Costo unitario inicial (unidades mayores por unidad de medida). */
  cost?: UnitCost;
  initialStock?: Quantity;
}

export type UpdateIngredientRequest = Partial<
  Omit<CreateIngredientRequest, 'initialStock' | 'cost'>
> & {
  isActive?: boolean;
};

/** Movimiento manual. En ADJUSTMENT `quantity` es el conteo físico; en el resto, una cantidad positiva. */
export interface CreateInventoryMovementRequest {
  ingredientId: Uuid;
  type: Extract<InventoryMovementType, 'ENTRY' | 'EXIT' | 'WASTE' | 'ADJUSTMENT'>;
  quantity: Quantity;
  unitCost?: UnitCost;
  reason?: string | null;
}

export interface InventoryMovementQuery {
  ingredientId?: Uuid;
  type?: InventoryMovementType;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}

export interface CreateSupplierRequest {
  name: string;
  taxId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export type UpdateSupplierRequest = Partial<CreateSupplierRequest> & { isActive?: boolean };

export interface CreatePurchaseRequest {
  supplierId: Uuid;
  supplierInvoiceNumber?: string | null;
  purchasedAt?: IsoDateTime;
  notes?: string | null;
  items: { ingredientId: Uuid; quantity: Quantity; unitCost: UnitCost }[];
  /** Recibir de inmediato: registra la entrada al inventario. */
  receive?: boolean;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface CreateCustomerRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  documentType?: IdentityDocumentType | null;
  documentNumber?: string | null;
  birthday?: IsoDate | null;
  address?: string | null;
  notes?: string | null;
}

export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

export interface CustomerHistoryEntry {
  orderId: Uuid;
  number: number;
  closedAt: IsoDateTime | null;
  total: MinorUnits;
  items: number;
}

// ─── Reportes ────────────────────────────────────────────────────────────────

export interface DateRangeQuery {
  /** Fecha local del restaurante (`YYYY-MM-DD`), inclusiva. Por defecto: hoy. */
  from?: IsoDate;
  to?: IsoDate;
}

export interface DashboardDto {
  from: IsoDate;
  to: IsoDate;
  salesTotal: MinorUnits;
  ordersCount: number;
  averageTicket: MinorUnits;
  guests: number;
  tipsTotal: MinorUnits;
  /** Ventas netas (sin impuestos ni propina) − costo teórico − gastos. */
  profit: MinorUnits;
  costOfSales: MinorUnits;
  expensesTotal: MinorUnits;
  salesByHour: { hour: number; total: MinorUnits; orders: number }[];
  salesByDay: { date: IsoDate; total: MinorUnits; orders: number }[];
  salesByCategory: { categoryId: Uuid | null; name: string; total: MinorUnits }[];
  topProducts: { productId: Uuid; name: string; quantity: number; total: MinorUnits }[];
  salesByWaiter: { waiterId: Uuid; name: string; total: MinorUnits; orders: number }[];
  paymentsByMethod: { method: PaymentMethod; total: MinorUnits }[];
  criticalInventory: {
    ingredientId: Uuid;
    name: string;
    stock: Quantity;
    minStock: Quantity;
    unit: string;
  }[];
}
