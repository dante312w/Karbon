import { Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  type LowStockAlert,
  OrderItemStatus,
  SocketEvent,
} from '@karbon/types';
import { notFound } from '../../common/errors/domain-error.js';
import { num } from '../../common/mapping.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';

export interface MovementInput {
  ingredientId: string;
  type: InventoryMovementType;
  /** Con signo: positivo entra, negativo sale. */
  delta: Prisma.Decimal | number;
  /** Costo unitario de una entrada: actualiza el costo promedio ponderado. */
  unitCost?: Prisma.Decimal | number | null;
  reason?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  userId?: string | null;
}

/**
 * Único punto que modifica existencias. Bloquea la fila del insumo, calcula el saldo y el costo
 * promedio ponderado y registra el movimiento inmutable del kardex con el saldo resultante.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async applyMovement(tx: Tx, input: MovementInput): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM ingredients WHERE id = ${input.ingredientId}::uuid FOR UPDATE`;
    const ingredient = await tx.ingredient.findUnique({ where: { id: input.ingredientId } });
    if (!ingredient) throw notFound('El insumo');

    const delta = new Prisma.Decimal(input.delta);
    const balance = ingredient.stock.add(delta);
    let averageCost = ingredient.averageCost;
    let lastCost: Prisma.Decimal | undefined;
    if (input.unitCost !== undefined && input.unitCost !== null && delta.gt(0)) {
      const cost = new Prisma.Decimal(input.unitCost);
      averageCost =
        ingredient.stock.gt(0) && balance.gt(0)
          ? ingredient.stock
              .mul(ingredient.averageCost)
              .add(delta.mul(cost))
              .div(balance)
              .toDecimalPlaces(4)
          : cost;
      lastCost = cost;
    }

    await tx.ingredient.update({
      where: { id: ingredient.id },
      data: { stock: balance, averageCost, ...(lastCost ? { lastCost } : {}) },
    });
    await tx.inventoryMovement.create({
      data: {
        ingredientId: ingredient.id,
        type: input.type,
        quantity: delta,
        balanceAfter: balance,
        unitCost:
          input.unitCost === undefined || input.unitCost === null
            ? averageCost
            : new Prisma.Decimal(input.unitCost),
        reason: input.reason ?? null,
        orderId: input.orderId ?? null,
        purchaseId: input.purchaseId ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  /** Descuenta los insumos de las recetas de un pedido pagado. Devuelve los insumos afectados. */
  async applySale(tx: Tx, orderId: string, orderNumber: number, userId: string): Promise<string[]> {
    const items = await tx.orderItem.findMany({
      where: {
        orderId,
        status: { not: OrderItemStatus.CANCELLED },
        product: { trackInventory: true },
      },
      select: {
        quantity: true,
        product: { select: { recipeItems: { select: { ingredientId: true, quantity: true } } } },
      },
    });
    const consumption = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      for (const line of item.product.recipeItems) {
        const current = consumption.get(line.ingredientId) ?? new Prisma.Decimal(0);
        consumption.set(line.ingredientId, current.add(line.quantity.mul(item.quantity)));
      }
    }
    // Orden fijo de bloqueo para que dos ventas simultáneas no se bloqueen mutuamente.
    const ingredientIds = [...consumption.keys()].sort();
    for (const ingredientId of ingredientIds) {
      await this.applyMovement(tx, {
        ingredientId,
        type: InventoryMovementType.SALE,
        delta: (consumption.get(ingredientId) ?? new Prisma.Decimal(0)).neg(),
        reason: `Venta pedido #${orderNumber}`,
        orderId,
        userId,
      });
    }
    return ingredientIds;
  }

  /** Devuelve al inventario lo consumido por un pedido (anulación del pago). */
  async reverseSale(
    tx: Tx,
    orderId: string,
    orderNumber: number,
    userId: string,
  ): Promise<string[]> {
    const movements = await tx.inventoryMovement.groupBy({
      by: ['ingredientId'],
      where: {
        orderId,
        type: { in: [InventoryMovementType.SALE, InventoryMovementType.SALE_REVERSAL] },
      },
      _sum: { quantity: true },
    });
    const pending = movements
      .map((row) => ({
        ingredientId: row.ingredientId,
        net: row._sum.quantity ?? new Prisma.Decimal(0),
      }))
      .filter((row) => row.net.lt(0))
      .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
    for (const row of pending) {
      await this.applyMovement(tx, {
        ingredientId: row.ingredientId,
        type: InventoryMovementType.SALE_REVERSAL,
        delta: row.net.neg(),
        reason: `Anulación pedido #${orderNumber}`,
        orderId,
        userId,
      });
    }
    return pending.map((row) => row.ingredientId);
  }

  /** Insumos activos en o bajo su mínimo (todos, o solo los indicados). */
  async lowStock(ingredientIds?: readonly string[]): Promise<LowStockAlert[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        stock: { lte: this.prisma.ingredient.fields.minStock },
        ...(ingredientIds ? { id: { in: [...ingredientIds] } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return ingredients.map((ingredient) => ({
      ingredientId: ingredient.id,
      name: ingredient.name,
      stock: num(ingredient.stock),
      minStock: num(ingredient.minStock),
      unit: ingredient.unit,
    }));
  }

  /** Notifica cambios de existencias (después de confirmar la transacción). */
  async publish(ingredientIds: readonly string[]): Promise<void> {
    if (ingredientIds.length === 0) return;
    const lowStock = await this.lowStock(ingredientIds);
    this.events.publish(
      SocketEvent.INVENTORY_UPDATED,
      { ingredientIds: [...ingredientIds], lowStock },
      EVENT_ROOMS.inventoryUpdated,
    );
  }
}
