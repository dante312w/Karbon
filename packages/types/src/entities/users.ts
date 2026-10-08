import type { IsoDateTime, Timestamps, Uuid } from '../common.js';
import type { Permission } from '../permissions.js';

export interface RoleDto extends Timestamps {
  id: Uuid;
  code: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
}

export interface UserDto extends Timestamps {
  id: Uuid;
  name: string;
  username: string;
  email: string | null;
  role: Pick<RoleDto, 'id' | 'code' | 'name'>;
  hasPin: boolean;
  isActive: boolean;
  lastLoginAt: IsoDateTime | null;
}
