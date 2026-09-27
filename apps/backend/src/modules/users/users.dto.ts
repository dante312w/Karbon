import { OmitType, PartialType } from '@nestjs/swagger';
import {
  ALL_PERMISSIONS,
  type CreateRoleRequest,
  type CreateUserRequest,
  type Permission,
  type UpdateUserRequest,
} from '@karbon/types';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  PIN_MESSAGE,
  PIN_PATTERN,
  USERNAME_MESSAGE,
  USERNAME_PATTERN,
} from '../../common/auth/credentials.js';

export class CreateUserDto implements CreateUserRequest {
  @IsString() @Length(1, 120) name!: string;

  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsOptional() @IsEmail() email?: string | null;

  @IsString()
  @Length(8, 128, { message: 'La clave debe tener al menos 8 caracteres' })
  password!: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @Matches(PIN_PATTERN, { message: PIN_MESSAGE })
  pin?: string | null;

  @IsUUID() roleId!: string;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @Length(8, 128) password?: string;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @Matches(PIN_PATTERN, { message: PIN_MESSAGE })
  pin?: string | null;

  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateRoleDto implements CreateRoleRequest {
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'El código usa MAYÚSCULAS, números y guion bajo' })
  code!: string;

  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions!: Permission[];
}

export class UpdateRoleDto extends PartialType(OmitType(CreateRoleDto, ['code'] as const)) {}
