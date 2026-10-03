import { PartialType } from '@nestjs/swagger';
import {
  type CreateAreaRequest,
  type CreateFloorElementRequest,
  type CreateReservationRequest,
  type CreateTableRequest,
  FloorElementKind,
  type MergeTablesRequest,
  ReservationStatus,
  type SetTableStatusRequest,
  TableShape,
  type UnmergeTablesRequest,
} from '@karbon/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { QueryBoolean } from '../../common/http/query-transforms.js';

export class CreateAreaDto implements CreateAreaRequest {
  @IsString() @Length(1, 60) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFloorElementDto implements CreateFloorElementRequest {
  @IsIn(Object.values(FloorElementKind)) kind!: FloorElementKind;
  @IsOptional() @IsString() @MaxLength(40) label?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(200) posX?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) posY?: number;
  @IsOptional() @IsInt() @Min(1) @Max(24) width?: number;
  @IsOptional() @IsInt() @Min(1) @Max(24) height?: number;
}

export class UpdateFloorElementDto extends PartialType(CreateFloorElementDto) {}

export class CreateTableDto implements CreateTableRequest {
  @IsUUID() areaId!: string;
  @IsString() @Length(1, 20) name!: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) capacity?: number;
  @IsOptional() @IsIn(Object.values(TableShape)) shape?: TableShape;
  @IsOptional() @IsInt() @Min(0) @Max(200) posX?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) posY?: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) width?: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) height?: number;
}

export class UpdateTableDto extends PartialType(CreateTableDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MergeTablesDto implements MergeTablesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tableIds!: string[];

  @IsOptional() @IsBoolean() separateAccounts?: boolean;
}

export class UnmergeTablesDto implements UnmergeTablesRequest {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tableIds?: string[];
}

export class SetTableStatusDto implements SetTableStatusRequest {
  @IsIn(['FREE', 'RESERVED']) status!: 'FREE' | 'RESERVED';
}

export class CreateReservationDto implements CreateReservationRequest {
  @IsOptional() @IsUUID() tableId?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsString() @Length(1, 120) customerName!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsInt() @Min(1) @Max(200) partySize!: number;
  @IsDateString() reservedFor!: string;
  @IsOptional() @IsInt() @Min(15) @Max(720) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class UpdateReservationDto extends PartialType(CreateReservationDto) {
  @IsOptional() @IsIn(Object.values(ReservationStatus)) status?: ReservationStatus;
}

export class ReservationQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class TableQueryDto {
  @IsOptional() @IsUUID() areaId?: string;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
