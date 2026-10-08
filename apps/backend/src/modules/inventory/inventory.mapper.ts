import type { IngredientDto, InventoryMovementDto, PurchaseDto, SupplierDto } from '@karbon/types';
import type {
  Ingredient,
  InventoryMovement,
  Prisma,
  Supplier,
} from '../../generated/prisma/client.js';
import { iso, isoOrNull, num, numOrNull, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';

export const PURCHASE_INCLUDE = {
  supplier: { select: { name: true } },
  items: { include: { ingredient: { select: { name: true } } } },
} satisfies Prisma.PurchaseInclude;

export type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

export function toIngredientDto(ingredient: Ingredient): IngredientDto {
  return {
    id: ingredient.id,
    sku: ingredient.sku,
    name: ingredient.name,
    unit: ingredient.unit,
    stock: num(ingredient.stock),
    minStock: num(ingredient.minStock),
    averageCost: num(ingredient.averageCost),
    lastCost: num(ingredient.lastCost),
    isLowStock: ingredient.stock.lte(ingredient.minStock),
    isActive: ingredient.isActive,
    ...timestamps(ingredient),
  };
}

export function toMovementDto(movement: InventoryMovement): InventoryMovementDto {
  return {
    id: movement.id,
    ingredientId: movement.ingredientId,
    type: movement.type,
    quantity: num(movement.quantity),
    balanceAfter: num(movement.balanceAfter),
    unitCost: numOrNull(movement.unitCost),
    reason: movement.reason,
    orderId: movement.orderId,
    purchaseId: movement.purchaseId,
    userId: movement.userId,
    createdAt: iso(movement.createdAt),
  };
}

export function toSupplierDto(supplier: Supplier): SupplierDto {
  return {
    id: supplier.id,
    name: supplier.name,
    taxId: supplier.taxId,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
    ...timestamps(supplier),
  };
}

export function toPurchaseDto(purchase: PurchaseWithRelations, currency: string): PurchaseDto {
  return {
    id: purchase.id,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.name,
    status: purchase.status,
    supplierInvoiceNumber: purchase.supplierInvoiceNumber,
    purchasedAt: iso(purchase.purchasedAt),
    receivedAt: isoOrNull(purchase.receivedAt),
    subtotal: decimalToMinor(purchase.subtotal, currency),
    taxTotal: decimalToMinor(purchase.taxTotal, currency),
    total: decimalToMinor(purchase.total, currency),
    notes: purchase.notes,
    items: purchase.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      quantity: num(item.quantity),
      unitCost: num(item.unitCost),
      total: decimalToMinor(item.total, currency),
    })),
    ...timestamps(purchase),
  };
}
