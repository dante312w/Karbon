import { type CreateStaffCallRequest, StaffCallReason, StaffCallTarget } from '@karbon/types';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateStaffCallDto implements CreateStaffCallRequest {
  @IsIn(Object.values(StaffCallTarget)) target!: StaffCallTarget;
  @IsIn(Object.values(StaffCallReason)) reason!: StaffCallReason;
  @IsOptional() @IsUUID() tableId?: string | null;
  @IsOptional() @IsUUID() orderId?: string | null;
  @IsOptional() @IsString() @MaxLength(140) message?: string | null;
}
