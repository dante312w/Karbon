import { OmitType, PartialType } from '@nestjs/swagger';
import {
  type CreateIngredientRequest,
  type CreateInventoryMovementRequest,
  type CreatePurchaseRequest,
  type CreateSupplierRequest,
  InventoryMovementType,
  MeasureUnit,
} from '@karbon/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { QueryBoolean } from '../../common/http/query-transforms.js';

const MANUAL_TYPES = ['ENTRY', 'EXIT', 'WASTE', 'ADJUSTMENT'] as const;

export class CreateIngredientDto implements CreateIngredientRequest {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) sku?: string | null;
  @IsIn(Object.values(MeasureUnit)) unit!: MeasureUnit;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) minStock?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) cost?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) initialStock?: number;
}

export class UpdateIngredientDto extends PartialType(
  OmitType(CreateIngredientDto, ['initialStock', 'cost'] as const),
) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class IngredientQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateMovementDto implements CreateInventoryMovementRequest {
  @IsUUID() ingredientId!: string;
  @IsIn(MANUAL_TYPES) type!: (typeof MANUAL_TYPES)[number];
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string | null;
}

export class MovementQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() ingredientId?: string;
  @IsOptional() @IsIn(Object.values(InventoryMovementType)) type?: InventoryMovementType;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CreateSupplierDto implements CreateSupplierRequest {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(30) taxId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PurchaseItemDto {
  @IsUUID() ingredientId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() quantity!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitCost!: number;
}

export class CreatePurchaseDto implements CreatePurchaseRequest {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsString() @MaxLength(40) supplierInvoiceNumber?: string | null;
  @IsOptional() @IsDateString() purchasedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];

  @IsOptional() @IsBoolean() receive?: boolean;
}

export class PurchaseQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() supplierId?: string;
}
