import {
  CashMovementType,
  type CloseCashSessionRequest,
  type CreateCashMovementRequest,
  type CreateExpenseRequest,
  type CreatePaymentRequest,
  type OpenCashSessionRequest,
  PaymentMethod,
  type VoidPaymentRequest,
} from '@karbon/types';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';

export class OpenCashSessionDto implements OpenCashSessionRequest {
  @IsInt() @Min(0) openingAmount!: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class CloseCashSessionDto implements CloseCashSessionRequest {
  @IsInt() @Min(0) countedCash!: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class CreateCashMovementDto implements CreateCashMovementRequest {
  @IsIn(Object.values(CashMovementType)) type!: CashMovementType;
  @IsInt() @Min(1) amount!: number;
  @IsString() @Length(3, 255) description!: string;
}

export class CreateExpenseDto implements CreateExpenseRequest {
  @IsString() @Length(2, 60) category!: string;
  @IsString() @Length(3, 255) description!: string;
  @IsInt() @Min(1) amount!: number;
  @IsIn(Object.values(PaymentMethod)) paymentMethod!: PaymentMethod;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsBoolean() paidFromCash?: boolean;
  @IsOptional() @IsString() @MaxLength(80) reference?: string | null;
  @IsOptional() @IsDateString() incurredAt?: string;
}

export class ExpenseQueryDto extends PageQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() cashSessionId?: string;
}

export class CreatePaymentDto implements CreatePaymentRequest {
  @IsIn(Object.values(PaymentMethod)) method!: PaymentMethod;
  /** 0 solo para cerrar un pedido de total cero (cortesía). */
  @IsInt() @Min(0) amount!: number;
  @IsOptional() @IsInt() @Min(0) tendered?: number;
  @IsOptional() @IsString() @MaxLength(80) reference?: string | null;
}

export class VoidPaymentDto implements VoidPaymentRequest {
  @IsString() @Length(3, 255) reason!: string;
}
