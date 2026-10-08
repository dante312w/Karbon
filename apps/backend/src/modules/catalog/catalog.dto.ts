import { PartialType } from '@nestjs/swagger';
import {
  type AssignNoteOptionsRequest,
  type CreateCategoryRequest,
  type CreateNoteOptionRequest,
  type CreateProductRequest,
  type ReorderNoteOptionsRequest,
  type SetNoteOptionsRequest,
  type UpdateNoteOptionRequest,
  KitchenStation,
  type RecipeLineInput,
  type SetRecipeRequest,
} from '@karbon/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryBoolean } from '../../common/http/query-transforms.js';

export class CreateCategoryDto implements CreateCategoryRequest {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) description?: string | null;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color hexadecimal #RRGGBB' }) color?:
    string | null;
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Una nota puede aplicar a muchas categorías o productos, sin repetirlos. */
const NOTE_LINKS_MAX = 200;

export class CreateNoteOptionDto implements CreateNoteOptionRequest {
  @IsString() @Length(1, 60) label!: string;
  @IsOptional() @IsBoolean() isGeneral?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTE_LINKS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTE_LINKS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds?: string[];
}

export class UpdateNoteOptionDto
  extends PartialType(CreateNoteOptionDto)
  implements UpdateNoteOptionRequest
{
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderNoteOptionsDto implements ReorderNoteOptionsRequest {
  @IsOptional() @IsUUID() categoryId!: string | null;
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids!: string[];
}

export class SetNoteOptionsDto implements SetNoteOptionsRequest {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  noteOptionIds!: string[];
}

class NoteAssignmentDto {
  @IsUUID() noteOptionId!: string;
  @IsBoolean() isGeneral!: boolean;
  @IsArray()
  @ArrayMaxSize(NOTE_LINKS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds!: string[];
}

export class AssignNoteOptionsDto implements AssignNoteOptionsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => NoteAssignmentDto)
  assignments!: NoteAssignmentDto[];
}

export class CreateProductDto implements CreateProductRequest {
  @IsUUID() categoryId!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsInt() @Min(0) @Max(100_000_000_000) price!: number;
  @IsOptional() @IsUUID() taxId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) sku?: string | null;
  @IsOptional() @IsString() @MaxLength(60) barcode?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsIn(Object.values(KitchenStation)) station?: KitchenStation;
  @IsOptional() @IsBoolean() sendToKitchen?: boolean;
  @IsOptional() @IsBoolean() trackInventory?: boolean;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RecipeLineDto implements RecipeLineInput {
  @IsUUID() ingredientId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() quantity!: number;
}

export class SetRecipeDto implements SetRecipeRequest {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  items!: RecipeLineDto[];
}

export class SetAvailabilityDto {
  @IsBoolean() isAvailable!: boolean;
}

export class ProductQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
