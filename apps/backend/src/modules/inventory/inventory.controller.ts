import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type IngredientDto,
  type InventoryMovementDto,
  type LowStockAlert,
  type Paginated,
  Permission,
  type PurchaseDto,
  type SupplierDto,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import {
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
import { InventoryService } from './inventory.service.js';
import { StockService } from './stock.service.js';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stock: StockService,
  ) {}

  @Get('ingredients')
  @RequirePermissions(Permission.INVENTORY_READ)
  listIngredients(@Query() query: IngredientQueryDto): Promise<IngredientDto[]> {
    return this.inventory.listIngredients(query);
  }

  @Get('ingredients/:id')
  @RequirePermissions(Permission.INVENTORY_READ)
  getIngredient(@Param('id', ParseUUIDPipe) id: string): Promise<IngredientDto> {
    return this.inventory.getIngredient(id);
  }

  @Post('ingredients')
  @RequirePermissions(Permission.INVENTORY_WRITE)
  createIngredient(
    @Body() dto: CreateIngredientDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IngredientDto> {
    return this.inventory.createIngredient(dto, user);
  }

  @Patch('ingredients/:id')
  @RequirePermissions(Permission.INVENTORY_WRITE)
  updateIngredient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<IngredientDto> {
    return this.inventory.updateIngredient(id, dto);
  }

  @Delete('ingredients/:id')
  @RequirePermissions(Permission.INVENTORY_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIngredient(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.inventory.deleteIngredient(id, user);
  }

  @Get('inventory/movements')
  @RequirePermissions(Permission.INVENTORY_READ)
  @ApiOperation({ summary: 'Kardex: movimientos por insumo, tipo y fecha' })
  listMovements(@Query() query: MovementQueryDto): Promise<Paginated<InventoryMovementDto>> {
    return this.inventory.listMovements(query);
  }

  @Post('inventory/movements')
  @RequirePermissions(Permission.INVENTORY_WRITE)
  @ApiOperation({ summary: 'Entrada, salida, merma o ajuste por conteo físico' })
  createMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IngredientDto> {
    return this.inventory.createMovement(dto, user);
  }

  @Get('inventory/alerts')
  @RequirePermissions(Permission.INVENTORY_READ)
  @ApiOperation({ summary: 'Insumos en o bajo el stock mínimo' })
  alerts(): Promise<LowStockAlert[]> {
    return this.stock.lowStock();
  }

  @Get('suppliers')
  @RequirePermissions(Permission.SUPPLIERS_READ)
  listSuppliers(@Query('search') search?: string): Promise<SupplierDto[]> {
    return this.inventory.listSuppliers(search);
  }

  @Post('suppliers')
  @RequirePermissions(Permission.SUPPLIERS_WRITE)
  createSupplier(@Body() dto: CreateSupplierDto): Promise<SupplierDto> {
    return this.inventory.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @RequirePermissions(Permission.SUPPLIERS_WRITE)
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierDto> {
    return this.inventory.updateSupplier(id, dto);
  }

  @Delete('suppliers/:id')
  @RequirePermissions(Permission.SUPPLIERS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSupplier(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.inventory.deleteSupplier(id);
  }

  @Get('purchases')
  @RequirePermissions(Permission.PURCHASES_READ)
  listPurchases(@Query() query: PurchaseQueryDto): Promise<Paginated<PurchaseDto>> {
    return this.inventory.listPurchases(query);
  }

  @Get('purchases/:id')
  @RequirePermissions(Permission.PURCHASES_READ)
  getPurchase(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseDto> {
    return this.inventory.getPurchase(id);
  }

  @Post('purchases')
  @RequirePermissions(Permission.PURCHASES_WRITE)
  createPurchase(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDto> {
    return this.inventory.createPurchase(dto, user);
  }

  @Post('purchases/:id/receive')
  @RequirePermissions(Permission.PURCHASES_WRITE)
  @ApiOperation({ summary: 'Recibe la compra: entrada al inventario y costo promedio' })
  receivePurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDto> {
    return this.inventory.receivePurchase(id, user);
  }

  @Post('purchases/:id/cancel')
  @RequirePermissions(Permission.PURCHASES_WRITE)
  cancelPurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDto> {
    return this.inventory.cancelPurchase(id, user);
  }
}
