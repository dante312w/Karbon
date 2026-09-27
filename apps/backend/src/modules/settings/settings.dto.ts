import { PartialType } from '@nestjs/swagger';
import {
  BusinessMode,
  FiscalDocumentType,
  type CreateNumberingRangeRequest,
  type CreatePrinterRequest,
  type CreateTaxRequest,
  type DayOfWeek,
  type OpeningHoursSlot,
  PrinterConnection,
  PrinterKind,
  PrinterPurpose,
  TaxKind,
  type UpdateSettingsRequest,
  type UploadImageRequest,
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
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OpeningHoursSlotDto implements OpeningHoursSlot {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: DayOfWeek;

  @Matches(TIME, { message: 'opensAt debe tener formato HH:mm' })
  opensAt!: string;

  @Matches(TIME, { message: 'closesAt debe tener formato HH:mm' })
  closesAt!: string;
}

export class UpdateSettingsDto implements UpdateSettingsRequest {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) taxId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @Length(2, 10) locale?: string;
  @IsOptional() @IsString() @Length(1, 50) timezone?: string;
  @IsOptional() @IsBoolean() pricesIncludeTax?: boolean;
  @IsOptional() @IsBoolean() tipEnabled?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tipPercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursSlotDto)
  openingHours?: OpeningHoursSlotDto[];

  @IsOptional() @IsString() @MaxLength(500) receiptHeader?: string | null;
  @IsOptional() @IsString() @MaxLength(500) receiptFooter?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(240) kdsWarningMinutes?: number;
  @IsOptional() @IsInt() @Min(2) @Max(480) kdsCriticalMinutes?: number;
  @IsOptional() @IsIn(Object.values(BusinessMode)) businessMode?: BusinessMode;
}

export class UploadImageDto implements UploadImageRequest {
  @IsString()
  @MaxLength(750_000)
  dataUrl!: string;
}

export class CreateTaxDto implements CreateTaxRequest {
  @IsString() @Length(1, 60) name!: string;
  @IsIn(Object.values(TaxKind)) kind!: TaxKind;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) rate!: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateTaxDto extends PartialType(CreateTaxDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreatePrinterDto implements CreatePrinterRequest {
  @IsString() @Length(1, 80) name!: string;
  @IsIn(Object.values(PrinterKind)) kind!: PrinterKind;
  @IsIn(Object.values(PrinterConnection)) connection!: PrinterConnection;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsInt() @IsIn([58, 80, 210]) paperWidthMm?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(Object.values(PrinterPurpose), { each: true })
  purposes!: PrinterPurpose[];
}

export class UpdatePrinterDto extends PartialType(CreatePrinterDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateNumberingRangeDto implements CreateNumberingRangeRequest {
  @IsIn(Object.values(FiscalDocumentType)) documentType!: FiscalDocumentType;
  @IsString()
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'El prefijo usa mayúsculas y números (máx. 10)' })
  prefix!: string;
  @IsInt() @Min(1) rangeFrom!: number;
  @IsInt() @Min(1) rangeTo!: number;
  @IsOptional() @IsString() @MaxLength(40) resolutionNumber?: string | null;
  @IsOptional() @IsDateString() resolutionDate?: string | null;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsString() @MaxLength(120) technicalKey?: string | null;
}

export class SetNumberingRangeActiveDto {
  @IsBoolean() isActive!: boolean;
}
