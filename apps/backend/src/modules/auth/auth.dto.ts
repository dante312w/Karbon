import {
  type LoginRequest,
  PIN_PATTERN,
  type PinLoginRequest,
  type RefreshTokenRequest,
} from '@karbon/types';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { PIN_MESSAGE } from '../../common/auth/credentials.js';

export class LoginDto implements LoginRequest {
  @IsString()
  @Length(1, 60)
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class PinLoginDto implements PinLoginRequest {
  @IsUUID()
  userId!: string;

  @Matches(PIN_PATTERN, { message: PIN_MESSAGE })
  pin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class RefreshTokenDto implements RefreshTokenRequest {
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}
