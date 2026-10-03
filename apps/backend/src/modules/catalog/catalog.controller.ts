import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type CategoryDto, Permission, type ProductDto, type RecipeItemDto } from '@karbon/types';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  Public,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/auth/decorators.js';
import { UploadImageDto } from '../settings/settings.dto.js';
import {
  CreateCategoryDto,
  CreateProductDto,
  ProductQueryDto,
  SetAvailabilityDto,
  SetRecipeDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('Catálogo')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @RequirePermissions(Permission.CATALOG_READ)
  listCategories(@Query('includeInactive') includeInactive?: string): Promise<CategoryDto[]> {
    return this.catalog.listCategories(includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.catalog.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.catalog.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.catalog.deleteCategory(id, user);
  }

  /** Cocina/barra también la consulta para marcar productos agotados desde el KDS. */
  @Get('products')
  @RequireAnyPermission(Permission.CATALOG_READ, Permission.KITCHEN_UPDATE)
  listProducts(@Query() query: ProductQueryDto): Promise<ProductDto[]> {
    return this.catalog.listProducts(query);
  }

  @Get('products/:id')
  @RequirePermissions(Permission.CATALOG_READ)
  getProduct(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
    return this.catalog.getProduct(id);
  }

  @Post('products')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductDto> {
    return this.catalog.createProduct(dto, user);
  }

  @Patch('products/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductDto> {
    return this.catalog.updateProduct(id, dto, user);
  }

  @Patch('products/:id/availability')
  @RequireAnyPermission(Permission.CATALOG_WRITE, Permission.KITCHEN_UPDATE)
  @ApiOperation({
    summary: 'Marca un producto como agotado o disponible (lo hace también cocina/barra)',
  })
  setAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAvailabilityDto,
  ): Promise<ProductDto> {
    return this.catalog.setAvailability(id, dto.isAvailable);
  }

  @Delete('products/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.catalog.deleteProduct(id, user);
  }

  @Put('products/:id/image')
  @RequirePermissions(Permission.CATALOG_WRITE)
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadImageDto,
  ): Promise<ProductDto> {
    return this.catalog.uploadImage(id, dto.dataUrl);
  }

  @Public()
  @Get('products/:id/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response): Promise<void> {
    const file = await this.catalog.imageFile(id);
    if (!file) throw new NotFoundException('Sin imagen');
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.sendFile(file);
  }

  @Get('products/:id/recipe')
  @RequirePermissions(Permission.CATALOG_READ)
  getRecipe(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeItemDto[]> {
    return this.catalog.getRecipe(id);
  }

  @Put('products/:id/recipe')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Reemplaza la receta y recalcula el costo teórico' })
  setRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecipeItemDto[]> {
    return this.catalog.setRecipe(id, dto, user);
  }
}
