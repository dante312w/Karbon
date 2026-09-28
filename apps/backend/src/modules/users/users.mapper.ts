import { type RoleDto, toPermissions, type UserDto } from '@karbon/types';
import type { Role, User } from '../../generated/prisma/client.js';
import { isoOrNull, timestamps } from '../../common/mapping.js';

export function toRoleDto(role: Role): RoleDto {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: toPermissions(role.permissions),
    isSystem: role.isSystem,
    ...timestamps(role),
  };
}

export function toUserDto(user: User & { role: Role }): UserDto {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: { id: user.role.id, code: user.role.code, name: user.role.name },
    hasPin: user.pinHash !== null,
    isActive: user.isActive,
    lastLoginAt: isoOrNull(user.lastLoginAt),
    ...timestamps(user),
  };
}
