import { Injectable } from '@nestjs/common';
import { ErrorCode, type RoleDto, type UserDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, invalid, notFound } from '../../common/errors/domain-error.js';
import { hashSecret } from '../../common/security/secret-hasher.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateRoleDto, CreateUserDto, UpdateRoleDto, UpdateUserDto } from './users.dto.js';
import { toRoleDto, toUserDto } from './users.mapper.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { name: 'asc' },
    });
    return users.map(toUserDto);
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedUser): Promise<UserDto> {
    await this.requireRole(dto.roleId);
    const [passwordHash, pinHash] = await Promise.all([
      hashSecret(dto.password),
      dto.pin ? hashSecret(dto.pin) : Promise.resolve(null),
    ]);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: dto.username.toLowerCase(),
        email: dto.email ?? null,
        passwordHash,
        pinHash,
        roleId: dto.roleId,
      },
      include: { role: true },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'user.create',
      entity: 'user',
      entityId: user.id,
    });
    return toUserDto(user);
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserDto> {
    await this.requireUser(id);
    if (id === actor.id && dto.isActive === false) {
      throw invalid(ErrorCode.CONFLICT, 'No puedes desactivar tu propio usuario');
    }
    if (dto.roleId) await this.requireRole(dto.roleId);
    const [passwordHash, pinHash] = await Promise.all([
      dto.password ? hashSecret(dto.password) : Promise.resolve(undefined),
      dto.pin ? hashSecret(dto.pin) : Promise.resolve(dto.pin === null ? null : undefined),
    ]);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.email === undefined ? {} : { email: dto.email }),
          ...(dto.roleId === undefined ? {} : { roleId: dto.roleId }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(passwordHash === undefined ? {} : { passwordHash }),
          ...(pinHash === undefined ? {} : { pinHash }),
        },
        include: { role: true },
      });
      // Desactivar o cambiar la clave cierra todas las sesiones del usuario.
      if (dto.isActive === false || passwordHash) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'user.update',
          entity: 'user',
          entityId: id,
          metadata: {
            fields: Object.keys(dto).map((key) =>
              key === 'password' || key === 'pin' ? `${key}*` : key,
            ),
          },
        },
        tx,
      );
      return updated;
    });
    return toUserDto(user);
  }

  async deleteUser(id: string, actor: AuthenticatedUser): Promise<void> {
    if (id === actor.id) throw invalid(ErrorCode.CONFLICT, 'No puedes eliminar tu propio usuario');
    await this.requireUser(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { userId: actor.id, action: 'user.delete', entity: 'user', entityId: id },
        tx,
      );
    });
  }

  async listRoles(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toRoleDto);
  }

  async createRole(dto: CreateRoleDto, actor: AuthenticatedUser): Promise<RoleDto> {
    const role = await this.prisma.role.create({
      data: { ...dto, description: dto.description ?? null, isSystem: false },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'role.create',
      entity: 'role',
      entityId: role.id,
    });
    return toRoleDto(role);
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AuthenticatedUser): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw notFound('El rol');
    if (role.isSystem) {
      throw conflict(
        ErrorCode.CONFLICT,
        'Los roles de sistema no se editan; crea un rol personalizado',
      );
    }
    const updated = await this.prisma.role.update({ where: { id }, data: { ...dto } });
    await this.audit.log({
      userId: actor.id,
      action: 'role.update',
      entity: 'role',
      entityId: id,
      metadata: { permissions: updated.permissions },
    });
    return toRoleDto(updated);
  }

  async deleteRole(id: string, actor: AuthenticatedUser): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw notFound('El rol');
    if (role.isSystem) throw conflict(ErrorCode.CONFLICT, 'Los roles de sistema no se eliminan');
    if (role._count.users > 0)
      throw conflict(ErrorCode.CONFLICT, 'El rol tiene usuarios asignados');
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ userId: actor.id, action: 'role.delete', entity: 'role', entityId: id });
  }

  private async requireRole(id: string): Promise<void> {
    if (!(await this.prisma.role.findUnique({ where: { id } }))) throw notFound('El rol');
  }

  private async requireUser(id: string): Promise<void> {
    if (!(await this.prisma.user.findFirst({ where: { id, deletedAt: null } })))
      throw notFound('El usuario');
  }
}
