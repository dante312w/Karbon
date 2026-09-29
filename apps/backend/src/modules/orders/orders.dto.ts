import {
  type AddOrderItemsRequest,
  type CancelRequest,
  type CreateOrderRequest,
  DiscountType,
  type DuplicateOrderRequest,
  KitchenStation,
  KitchenTicketStatus,
  type MoveOrderRequest,
  type OrderDiscountInput,
  type OrderItemInput,
  OrderType,
  type ReorderItemsRequest,
  type SetOrderDiscountRequest,
  type SplitOrderRequest,
  type UpdateOrderItemRequest,
  type UpdateOrderRequest,
  type UpdateTicketStatusRequest,
  type VersionedRequest,
} from '@karbon/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { QueryBoolean } from '../../common/http/query-transforms.js';

export class OrderItemInputDto implements OrderItemInput {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(999) quantity!: number;
  @IsOptional() @IsString() @MaxLength(255) notes?: string | null;
}

export class CreateOrderDto implements CreateOrderRequest {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsIn(Object.values(OrderType)) type?: OrderType;
  @IsOptional() @IsUUID() tableId?: string | null;
  @IsOptional() @IsString() @Length(1, 60) label?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(200) guests?: number | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @IsOptional() @IsBoolean() send?: boolean;
}

export class AddItemsDto implements AddOrderItemsRequest {
  @IsOptional() @IsInt() @Min(0) version?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional() @IsBoolean() send?: boolean;
}

export class VersionDto implements VersionedRequest {
  @IsInt() @Min(0) version!: number;
}

export class OptionalVersionDto {
  @IsOptional() @IsInt() @Min(0) version?: number;
}

export class UpdateOrderDto extends VersionDto implements UpdateOrderRequest {
  @IsOptional() @IsInt() @Min(1) @Max(200) guests?: number | null;
  @IsOptional() @IsString() @MaxLength(60) label?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tipPercent?: number;
}

export class UpdateItemDto extends VersionDto implements UpdateOrderItemRequest {
  @IsOptional() @IsInt() @Min(1) @Max(999) quantity?: number;
  @IsOptional() @IsString() @MaxLength(255) notes?: string | null;
  @IsOptional() @IsInt() @Min(0) discount?: number;
}

export class OrderDiscountInputDto implements OrderDiscountInput {
  @IsIn(Object.values(DiscountType)) type!: DiscountType;
  /** Porcentaje (hasta 2 decimales) o valor en unidades menores; el servicio valida cada caso. */
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() value!: number;
  @IsString() @Length(3, 255) reason!: string;
}

/** `discount: null` quita el descuento; omitirlo es un error (no se quita por accidente). */
export class SetOrderDiscountDto extends VersionDto implements SetOrderDiscountRequest {
  @ValidateIf((dto: SetOrderDiscountDto) => dto.discount !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => OrderDiscountInputDto)
  discount!: OrderDiscountInputDto | null;
}

export class CancelDto extends VersionDto implements CancelRequest {
  @IsString() @Length(3, 255) reason!: string;
}

/** Quitar un ítem aún no enviado no exige motivo. */
export class CancelItemDto extends VersionDto {
  @IsOptional() @IsString() @Length(3, 255) reason?: string;
}

export class ReorderItemsDto extends VersionDto implements ReorderItemsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  itemIds!: string[];
}

export class MoveOrderDto extends VersionDto implements MoveOrderRequest {
  @IsUUID() tableId!: string;
}

export class SplitLineDto {
  @IsUUID() itemId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class SplitOrderDto extends VersionDto implements SplitOrderRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  items!: SplitLineDto[];
}

export class DuplicateOrderDto implements DuplicateOrderRequest {
  @IsOptional() @IsUUID() tableId?: string | null;
  @IsOptional() @IsString() @Length(1, 60) label?: string | null;
}

export class OrderQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['ACTIVE', 'PAID', 'CANCELLED']) status?: 'ACTIVE' | 'PAID' | 'CANCELLED';
  @IsOptional() @IsUUID() tableId?: string;
  @IsOptional() @IsUUID() waiterId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class TicketQueryDto {
  @IsOptional() @IsIn(Object.values(KitchenStation)) station?: KitchenStation;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeDelivered?: boolean;
}

export class UpdateTicketStatusDto implements UpdateTicketStatusRequest {
  @IsIn(Object.values(KitchenTicketStatus)) status!: KitchenTicketStatus;
}
