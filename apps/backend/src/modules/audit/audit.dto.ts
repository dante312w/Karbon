import type { AuditLogQuery } from '@karbon/types';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';

export class AuditLogQueryDto extends PageQueryDto implements AuditLogQuery {
  @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
