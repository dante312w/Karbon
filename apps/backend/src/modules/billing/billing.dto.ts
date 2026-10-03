import { FiscalDocumentType, type IssueInvoiceRequest, type PrintRequest } from '@karbon/types';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';

export class IssueInvoiceDto implements IssueInvoiceRequest {
  @IsOptional() @IsIn(Object.values(FiscalDocumentType)) documentType?: FiscalDocumentType;
  @IsOptional() @IsUUID() customerId?: string | null;
}

export class PrintDto implements PrintRequest {
  @IsUUID() printerId!: string;
  /** Abre el cajón monedero conectado a la impresora. */
  @IsOptional() @IsBoolean() openDrawer?: boolean;
}

export class VoidInvoiceDto {
  @IsString() @Length(3, 255) reason!: string;
}

export class InvoiceQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
