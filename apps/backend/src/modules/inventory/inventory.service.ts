import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type IngredientDto,
  InventoryMovementType,
  type InventoryMovementDto,
  type Paginated,
  type PurchaseDto,
  PurchaseStatus,
  type SupplierDto,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, invalid, notFound } from '../../common/errors/domain-error.js';
import {
  dateRange,
  containsInsensitive,
  pageArgs,
  paginated,
} from '../../common/http/pagination.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateIngredientDto,
  CreateMovementDto,
  CreatePurchaseDto,
  CreateSupplierDto,
  IngredientQueryDto,
  MovementQueryDto,
  PurchaseQueryDto,
  UpdateIngredientDto,
  UpdateSupplierDto,
} from './inventory.dto.js';
import {
  PURCHASE_INCLUDE,
  toIngredientDto,
  toMovementDto,
  toPurchaseDto,
  toSupplierDto,
} from './inventory.mapper.js';
import { ProductCostService } from './product-cost.service.js';
import { StockService } from './stock.service.js';

const SIGN: Readonly<Record<'ENTRY' | 'EXIT' | 'WASTE', 1 | -1>> = {
  ENTRY: 1,
  EXIT: -1,
  WASTE: -1,
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly costs: ProductCostService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Insumos ────────────────────────────────────────────────────────────────

  async listIngredients(query: IngredientQueryDto): Promise<IngredientDto[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        deletedAt: null,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.search ? { name: containsInsensitive(query.search) } : {}),
        ...(query.lowStockOnly ? { stock: { lte: this.prisma.ingredient.fields.minStock } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return ingredients.map(toIngredientDto);
  }

  async getIngredient(id: string): Promise<IngredientDto> {
    const ingredient = await this.prisma.ingredient.findFirst({ where: { id, deletedAt: null } });
    if (!ingredient) throw notFound('El insumo');
    return toIngredientDto(ingredient);
  }

  async createIngredient(
    dto: CreateIngredientDto,
    user: AuthenticatedUser,
  ): Promise<IngredientDto> {
    const ingredient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          name: dto.name.trim(),
          sku: dto.sku ?? null,
          unit: dto.unit,
          minStock: dto.minStock ?? 0,
          averageCost: dto.cost ?? 0,
          lastCost: dto.cost ?? 0,
        },
      });
      if (dto.initialStock && dto.initialStock > 0) {
        await this.stock.applyMovement(tx, {
          ingredientId: created.id,
          type: InventoryMovementType.ENTRY,
          delta: dto.initialStock,
          unitCost: dto.cost ?? null,
          reason: 'Inventario inicial',
          userId: user.id,
        });
      }
      return tx.ingredient.findUniqueOrThrow({ where: { id: created.id } });
    });
    return toIngredientDto(ingredient);
  }

  async updateIngredient(id: string, dto: UpdateIngredientDto): Promise<IngredientDto> {
    return toIngredientDto(await this.prisma.ingredient.update({ where: { id }, data: dto }));
  }

  async deleteIngredient(id: string, user: AuthenticatedUser): Promise<void> {
    const inRecipes = await this.prisma.recipeItem.count({
      where: { ingredientId: id, product: { deletedAt: null } },
    });
    if (inRecipes > 0)
      throw conflict(ErrorCode.CONFLICT, 'El insumo se usa en recetas de productos activos');
    await this.prisma.ingredient.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'ingredient.delete',
      entity: 'ingredient',
      entityId: id,
    });
  }

  // ─── Movimientos y kardex ───────────────────────────────────────────────────

  async listMovements(query: MovementQueryDto): Promise<Paginated<InventoryMovementDto>> {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...dateRange('createdAt', query),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return paginated(items.map(toMovementDto), total, query);
  }

  /** Entradas, salidas, mermas y ajustes por conteo físico. */
  async createMovement(dto: CreateMovementDto, user: AuthenticatedUser): Promise<IngredientDto> {
    const ingredient = await this.prisma.$transaction(async (tx) => {
      const current = await tx.ingredient.findFirst({
        where: { id: dto.ingredientId, deletedAt: null },
      });
      if (!current) throw notFound('El insumo');
      let delta: Prisma.Decimal;
      if (dto.type === 'ADJUSTMENT') {
        delta = new Prisma.Decimal(dto.quantity).sub(current.stock);
        if (delta.isZero())
          throw invalid(ErrorCode.VALIDATION_FAILED, 'El conteo coincide con el sistema');
      } else {
        if (dto.quantity <= 0)
          throw invalid(ErrorCode.VALIDATION_FAILED, 'La cantidad debe ser mayor que cero');
        delta = new Prisma.Decimal(dto.quantity).mul(SIGN[dto.type]);
      }
      await this.stock.applyMovement(tx, {
        ingredientId: current.id,
        type: dto.type,
        delta,
        unitCost: dto.type === 'ENTRY' ? (dto.unitCost ?? null) : null,
        reason: dto.reason ?? null,
        userId: user.id,
      });
      if (dto.type === 'ENTRY' && dto.unitCost !== undefined) {
        await this.costs.recalculate(tx, { ingredientIds: [current.id] });
      }
      return tx.ingredient.findUniqueOrThrow({ where: { id: current.id } });
    });
    await this.stock.publish([ingredient.id]);
    return toIngredientDto(ingredient);
  }

  // ─── Proveedores ────────────────────────────────────────────────────────────

  async listSuppliers(search?: string): Promise<SupplierDto[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null, ...(search ? { name: containsInsensitive(search) } : {}) },
      orderBy: { name: 'asc' },
    });
    return suppliers.map(toSupplierDto);
  }

  async createSupplier(dto: CreateSupplierDto): Promise<SupplierDto> {
    return toSupplierDto(
      await this.prisma.supplier.create({ data: { ...dto, name: dto.name.trim() } }),
    );
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto): Promise<SupplierDto> {
    return toSupplierDto(await this.prisma.supplier.update({ where: { id }, data: dto }));
  }

  async deleteSupplier(id: string): Promise<void> {
    await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  // ─── Compras ────────────────────────────────────────────────────────────────

  async listPurchases(query: PurchaseQueryDto): Promise<Paginated<PurchaseDto>> {
    const currency = await this.settings.currency();
    const where: Prisma.PurchaseWhereInput = query.supplierId
      ? { supplierId: query.supplierId }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: { purchasedAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return paginated(
      items.map((purchase) => toPurchaseDto(purchase, currency)),
      total,
      query,
    );
  }

  async createPurchase(dto: CreatePurchaseDto, user: AuthenticatedUser): Promise<PurchaseDto> {
    const lines = dto.items.map((item) => {
      const total = new Prisma.Decimal(item.quantity).mul(item.unitCost).toDecimalPlaces(2);
      return {
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        total,
      };
    });
    const total = lines.reduce((sum, line) => sum.add(line.total), new Prisma.Decimal(0));
    const purchaseId = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          userId: user.id,
          supplierInvoiceNumber: dto.supplierInvoiceNumber ?? null,
          purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
          notes: dto.notes ?? null,
          subtotal: total,
          total,
          items: { create: lines },
        },
      });
      if (dto.receive) await this.receiveInTx(tx, purchase.id, user);
      return purchase.id;
    });
    if (dto.receive) await this.stock.publish(lines.map((line) => line.ingredientId));
    return this.getPurchase(purchaseId);
  }

  async receivePurchase(id: string, user: AuthenticatedUser): Promise<PurchaseDto> {
    const ingredientIds = await this.prisma.$transaction((tx) => this.receiveInTx(tx, id, user));
    await this.stock.publish(ingredientIds);
    return this.getPurchase(id);
  }

  async cancelPurchase(id: string, user: AuthenticatedUser): Promise<PurchaseDto> {
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase) throw notFound('La compra');
    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw conflict(ErrorCode.INVALID_STATUS_TRANSITION, 'Solo se anulan compras en borrador');
    }
    await this.prisma.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.CANCELLED },
    });
    await this.audit.log({
      userId: user.id,
      action: 'purchase.cancel',
      entity: 'purchase',
      entityId: id,
    });
    return this.getPurchase(id);
  }

  async getPurchase(id: string): Promise<PurchaseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase) throw notFound('La compra');
    return toPurchaseDto(purchase, await this.settings.currency());
  }

  private async receiveInTx(tx: Tx, id: string, user: AuthenticatedUser): Promise<string[]> {
    const updated = await tx.purchase.updateMany({
      where: { id, status: PurchaseStatus.DRAFT },
      data: { status: PurchaseStatus.RECEIVED, receivedAt: new Date() },
    });
    if (updated.count === 0)
      throw conflict(ErrorCode.INVALID_STATUS_TRANSITION, 'La compra ya fue recibida o anulada');
    const items = await tx.purchaseItem.findMany({
      where: { purchaseId: id },
      orderBy: { ingredientId: 'asc' },
    });
    for (const item of items) {
      await this.stock.applyMovement(tx, {
        ingredientId: item.ingredientId,
        type: InventoryMovementType.PURCHASE,
        delta: item.quantity,
        unitCost: item.unitCost,
        reason: 'Compra recibida',
        purchaseId: id,
        userId: user.id,
      });
    }
    const ingredientIds = [...new Set(items.map((item) => item.ingredientId))];
    await this.costs.recalculate(tx, { ingredientIds });
    await this.audit.log(
      { userId: user.id, action: 'purchase.receive', entity: 'purchase', entityId: id },
      tx,
    );
    return ingredientIds;
  }
}
