import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../prisma/prisma.types.js';

/** Costo teórico de un producto = Σ cantidad de receta × costo promedio del insumo. */
@Injectable()
export class ProductCostService {
  async recalculate(
    tx: Tx,
    scope: { productIds?: readonly string[]; ingredientIds?: readonly string[] },
  ): Promise<void> {
    const products = await tx.product.findMany({
      where: {
        deletedAt: null,
        ...(scope.productIds ? { id: { in: [...scope.productIds] } } : {}),
        ...(scope.ingredientIds
          ? { recipeItems: { some: { ingredientId: { in: [...scope.ingredientIds] } } } }
          : {}),
      },
      select: {
        id: true,
        cost: true,
        recipeItems: { select: { quantity: true, ingredient: { select: { averageCost: true } } } },
      },
    });
    for (const product of products) {
      const cost = product.recipeItems
        .reduce(
          (sum, line) => sum.add(line.quantity.mul(line.ingredient.averageCost)),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2);
      if (!cost.equals(product.cost)) {
        await tx.product.update({ where: { id: product.id }, data: { cost } });
      }
    }
  }
}
