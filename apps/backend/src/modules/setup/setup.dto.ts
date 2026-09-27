import { BusinessMode, type CompleteSetupRequest } from '@karbon/types';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  PIN_MESSAGE,
  PIN_PATTERN,
  USERNAME_MESSAGE,
  USERNAME_PATTERN,
} from '../../common/auth/credentials.js';

export class CompleteSetupDto implements CompleteSetupRequest {
  @IsString() @Length(2, 120) restaurantName!: string;

  @IsIn(Object.values(BusinessMode)) businessMode!: BusinessMode;

  @IsString() @Length(2, 120) adminName!: string;

  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  adminUsername!: string;

  @IsString()
  @Length(8, 128, { message: 'La clave debe tener al menos 8 caracteres' })
  adminPassword!: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @Matches(PIN_PATTERN, { message: PIN_MESSAGE })
  adminPin?: string | null;

  @IsOptional() @IsBoolean() loadDemoData?: boolean;
}
