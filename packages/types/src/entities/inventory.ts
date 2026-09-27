import type { IsoDateTime, MinorUnits, Quantity, Timestamps, UnitCost, Uuid } from '../common.js';
import type { InventoryMovementType, MeasureUnit, PurchaseStatus } from '../enums.js';

export interface IngredientDto extends Timestamps {
  id: Uuid;
  sku: string | null;
  name: string;
  unit: MeasureUnit;
  stock: Quantity;
  minStock: Quantity;
  /** Costo promedio ponderado por unidad de medida. */
  averageCost: UnitCost;
  lastCost: UnitCost;
  isLowStock: boolean;
  isActive: boolean;
}

/** Una línea de receta: cuánto insumo consume una unidad vendida del producto. */
export interface RecipeItemDto {
  id: Uuid;
  productId: Uuid;
  ingredientId: Uuid;
  ingredientName: string;
  unit: MeasureUnit;
  quantity: Quantity;
}

/** Registro inmutable del kardex. */
export interface InventoryMovementDto {
  id: Uuid;
  ingredientId: Uuid;
  type: InventoryMovementType;
  /** Con signo: positivo entra, negativo sale. */
  quantity: Quantity;
  balanceAfter: Quantity;
  unitCost: UnitCost | null;
  reason: string | null;
  orderId: Uuid | null;
  purchaseId: Uuid | null;
  userId: Uuid | null;
  createdAt: IsoDateTime;
}

export interface SupplierDto extends Timestamps {
  id: Uuid;
  name: string;
  taxId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface PurchaseItemDto {
  id: Uuid;
  ingredientId: Uuid;
  ingredientName: string;
  quantity: Quantity;
  unitCost: UnitCost;
  total: MinorUnits;
}

export interface PurchaseDto extends Timestamps {
  id: Uuid;
  supplierId: Uuid;
  supplierName: string;
  status: PurchaseStatus;
  supplierInvoiceNumber: string | null;
  purchasedAt: IsoDateTime;
  receivedAt: IsoDateTime | null;
  subtotal: MinorUnits;
  taxTotal: MinorUnits;
  total: MinorUnits;
  notes: string | null;
  items: PurchaseItemDto[];
}
