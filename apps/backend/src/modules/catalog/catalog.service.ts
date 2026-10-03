import { Injectable } from '@nestjs/common';
import { type CategoryDto, ErrorCode, type ProductDto, type RecipeItemDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, notFound } from '../../common/errors/domain-error.js';
import { containsInsensitive } from '../../common/http/pagination.js';
import { minorToDecimal } from '../../common/money.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ProductCostService } from '../inventory/product-cost.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateCategoryDto,
  CreateProductDto,
  ProductQueryDto,
  SetRecipeDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto.js';
import { toCategoryDto, toProductDto, toRecipeItemDto } from './catalog.mapper.js';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly costs: ProductCostService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ─── Categorías ─────────────────────────────────────────────────────────────

  async listCategories(includeInactive = false): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryDto);
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDto> {
    return toCategoryDto(
      await this.prisma.category.create({ data: { ...dto, name: dto.name.trim() } }),
    );
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    if (dto.parentId === id)
      throw conflict(ErrorCode.CONFLICT, 'Una categoría no puede ser su propia madre');
    return toCategoryDto(await this.prisma.category.update({ where: { id }, data: dto }));
  }

  /**
   * Borrado lógico: los pedidos pasados siguen apuntando a sus productos. Sus notas de un toque
   * dejan de aplicarle (siguen en sus otras categorías; los pedidos guardan el texto).
   */
  async deleteCategory(id: string, user: AuthenticatedUser): Promise<void> {
    const [products, children] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
    ]);
    if (products > 0)
      throw conflict(ErrorCode.CONFLICT, 'La categoría tiene productos; muévelos primero');
    if (children > 0)
      throw conflict(ErrorCode.CONFLICT, 'La categoría tiene subcategorías; muévelas primero');
    await this.prisma.$transaction([
      this.prisma.category.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      this.prisma.noteOptionCategory.deleteMany({ where: { categoryId: id } }),
    ]);
    await this.audit.log({
      userId: user.id,
      action: 'category.delete',
      entity: 'category',
      entityId: id,
    });
  }

  // ─── Productos ──────────────────────────────────────────────────────────────

  async listProducts(query: ProductQueryDto): Promise<ProductDto[]> {
    const currency = await this.settings.currency();
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: containsInsensitive(query.search) },
                { sku: containsInsensitive(query.search) },
                { barcode: query.search.trim() },
              ],
            }
          : {}),
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return products.map((product) => toProductDto(product, currency));
  }

  async getProduct(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw notFound('El producto');
    return toProductDto(product, await this.settings.currency());
  }

  async createProduct(dto: CreateProductDto, user: AuthenticatedUser): Promise<ProductDto> {
    const currency = await this.settings.currency();
    const product = await this.prisma.product.create({
      data: { ...dto, name: dto.name.trim(), price: minorToDecimal(dto.price, currency) },
    });
    await this.audit.log({
      userId: user.id,
      action: 'product.create',
      entity: 'product',
      entityId: product.id,
    });
    return toProductDto(product, currency);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    user: AuthenticatedUser,
  ): Promise<ProductDto> {
    const currency = await this.settings.currency();
    const { price, ...rest } = dto;
    const product = await this.prisma.product.update({
      where: { id },
      data: { ...rest, ...(price === undefined ? {} : { price: minorToDecimal(price, currency) }) },
    });
    await this.audit.log({
      userId: user.id,
      action: 'product.update',
      entity: 'product',
      entityId: id,
      metadata: { fields: Object.keys(dto), ...(price === undefined ? {} : { price }) },
    });
    return toProductDto(product, currency);
  }

  async setAvailability(id: string, isAvailable: boolean): Promise<ProductDto> {
    const product = await this.prisma.product.update({ where: { id }, data: { isAvailable } });
    return toProductDto(product, await this.settings.currency());
  }

  async deleteProduct(id: string, user: AuthenticatedUser): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'product.delete',
      entity: 'product',
      entityId: id,
    });
  }

  async uploadImage(id: string, dataUrl: string): Promise<ProductDto> {
    await this.getProduct(id);
    const imagePath = await this.storage.saveImage('products', id, dataUrl);
    const product = await this.prisma.product.update({ where: { id }, data: { imagePath } });
    return toProductDto(product, await this.settings.currency());
  }

  async imageFile(id: string): Promise<string | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { imagePath: true },
    });
    return product?.imagePath ? this.storage.uploadPath(product.imagePath) : null;
  }

  // ─── Recetas ────────────────────────────────────────────────────────────────

  async getRecipe(productId: string): Promise<RecipeItemDto[]> {
    const items = await this.prisma.recipeItem.findMany({
      where: { productId },
      include: { ingredient: true },
      orderBy: { ingredient: { name: 'asc' } },
    });
    return items.map(toRecipeItemDto);
  }

  /** Reemplaza la receta completa y recalcula el costo teórico del producto. */
  async setRecipe(
    productId: string,
    dto: SetRecipeDto,
    user: AuthenticatedUser,
  ): Promise<RecipeItemDto[]> {
    await this.getProduct(productId);
    const ids = dto.items.map((item) => item.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw badRequest('Un insumo aparece más de una vez en la receta');
    }
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.ingredient.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) throw notFound('Alguno de los insumos');
      await tx.recipeItem.deleteMany({ where: { productId } });
      if (dto.items.length > 0) {
        await tx.recipeItem.createMany({
          data: dto.items.map((item) => ({
            productId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          })),
        });
      }
      await this.costs.recalculate(tx, { productIds: [productId] });
      await this.audit.log(
        {
          userId: user.id,
          action: 'product.recipe',
          entity: 'product',
          entityId: productId,
          metadata: { lines: dto.items.length },
        },
        tx,
      );
    });
    return this.getRecipe(productId);
  }
}
