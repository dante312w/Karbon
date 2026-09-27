import type { CategoryDto, ProductDto, RecipeItemDto } from '@karbon/types';
import type { Category, Ingredient, Product, RecipeItem } from '../../generated/prisma/client.js';
import { num, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    description: category.description,
    color: category.color,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    ...timestamps(category),
  };
}

export function toProductDto(product: Product, currency: string): ProductDto {
  return {
    id: product.id,
    categoryId: product.categoryId,
    taxId: product.taxId,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    price: decimalToMinor(product.price, currency),
    cost: decimalToMinor(product.cost, currency),
    imageUrl: product.imagePath
      ? `/api/v1/products/${product.id}/image?v=${product.updatedAt.getTime()}`
      : null,
    station: product.station,
    sendToKitchen: product.sendToKitchen,
    trackInventory: product.trackInventory,
    isAvailable: product.isAvailable,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    ...timestamps(product),
  };
}

export function toRecipeItemDto(item: RecipeItem & { ingredient: Ingredient }): RecipeItemDto {
  return {
    id: item.id,
    productId: item.productId,
    ingredientId: item.ingredientId,
    ingredientName: item.ingredient.name,
    unit: item.ingredient.unit,
    quantity: num(item.quantity),
  };
}
