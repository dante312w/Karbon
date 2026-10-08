import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AuthUser,
  ErrorCode,
  type LoginResponse,
  type PinUserOption,
  toPermissions,
} from '@karbon/types';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { DomainError } from '../../common/errors/domain-error.js';
import { hashSecret, verifySecret } from '../../common/security/secret-hasher.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from './token.service.js';

export interface SessionMetadata {
  deviceName?: string | undefined;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

type UserWithRole = NonNullable<Awaited<ReturnType<AuthService['findActiveUser']>>>;

const INVALID_CREDENTIALS = (): DomainError =>
  new DomainError(
    ErrorCode.INVALID_CREDENTIALS,
    'Usuario o clave incorrectos',
    HttpStatus.UNAUTHORIZED,
  );

const INVALID_REFRESH = (): DomainError =>
  new DomainError(
    ErrorCode.REFRESH_TOKEN_INVALID,
    'La sesión expiró; ingresa de nuevo',
    HttpStatus.UNAUTHORIZED,
  );

@Injectable()
export class AuthService {
  /** Hash de referencia para igualar tiempos cuando el usuario no existe. */
  private readonly dummyHash = hashSecret(randomUUID());

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, meta: SessionMetadata): Promise<LoginResponse> {
    const user = await this.findActiveUser({ username: username.trim().toLowerCase() });
    const valid = await verifySecret(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw INVALID_CREDENTIALS();
    return this.startSession(user, meta);
  }

  async pinLogin(userId: string, pin: string, meta: SessionMetadata): Promise<LoginResponse> {
    const user = await this.findActiveUser({ id: userId });
    const valid = await verifySecret(pin, user?.pinHash ?? (await this.dummyHash));
    if (!user?.pinHash || !valid) throw INVALID_CREDENTIALS();
    return this.startSession(user, meta);
  }

  /** Sesión para un usuario recién creado por el asistente de primer arranque. */
  async startSessionFor(userId: string, meta: SessionMetadata): Promise<LoginResponse> {
    const user = await this.findActiveUser({ id: userId });
    if (!user) throw INVALID_CREDENTIALS();
    return this.startSession(user, meta);
  }

  /**
   * Rotación de refresh tokens: cada uso emite uno nuevo en la misma familia. Si llega un
   * token ya rotado (posible robo), se revoca toda la familia y se exige ingresar de nuevo.
   */
  async refresh(refreshToken: string, meta: SessionMetadata): Promise<LoginResponse> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
    });
    if (!stored) throw INVALID_REFRESH();
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      await this.audit.log({
        userId: stored.userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'refresh_token',
        entityId: stored.familyId,
        ipAddress: meta.ipAddress ?? null,
      });
      throw INVALID_REFRESH();
    }
    if (stored.expiresAt <= new Date()) throw INVALID_REFRESH();

    const user = await this.findActiveUser({ id: stored.userId });
    if (!user) {
      await this.revokeFamily(stored.familyId);
      throw INVALID_REFRESH();
    }

    const nextToken = this.tokens.generateRefreshToken();
    const next = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId: stored.familyId,
          tokenHash: this.tokens.hashRefreshToken(nextToken),
          deviceName: stored.deviceName,
          userAgent: meta.userAgent?.slice(0, 255) ?? stored.userAgent,
          ipAddress: meta.ipAddress ?? stored.ipAddress,
          expiresAt: new Date(Date.now() + this.tokens.refreshTtlMs),
        },
      });
      const rotated = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
      // Dos renovaciones simultáneas con el mismo token: solo una gana.
      if (rotated.count === 0) throw INVALID_REFRESH();
      return created;
    });
    return this.buildResponse(user, next.familyId, nextToken);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async me(current: AuthenticatedUser): Promise<AuthUser> {
    const user = await this.findActiveUser({ id: current.id });
    if (!user)
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Usuario inactivo', HttpStatus.UNAUTHORIZED);
    return this.toAuthUser(user);
  }

  async pinUsers(): Promise<PinUserOption[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null, pinHash: { not: null } },
      include: { role: true },
      orderBy: [{ role: { code: 'asc' } }, { name: 'asc' }],
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      roleCode: user.role.code,
      roleName: user.role.name,
    }));
  }

  private findActiveUser(where: { id: string } | { username: string }) {
    return this.prisma.user.findFirst({
      where: { ...where, isActive: true, deletedAt: null },
      include: { role: true },
    });
  }

  private async startSession(user: UserWithRole, meta: SessionMetadata): Promise<LoginResponse> {
    const refreshToken = this.tokens.generateRefreshToken();
    const familyId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: this.tokens.hashRefreshToken(refreshToken),
          deviceName: meta.deviceName?.slice(0, 120) ?? null,
          userAgent: meta.userAgent?.slice(0, 255) ?? null,
          ipAddress: meta.ipAddress ?? null,
          expiresAt: new Date(Date.now() + this.tokens.refreshTtlMs),
        },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    return this.buildResponse(user, familyId, refreshToken);
  }

  private buildResponse(user: UserWithRole, familyId: string, refreshToken: string): LoginResponse {
    const authUser = this.toAuthUser(user);
    return {
      accessToken: this.tokens.signAccessToken({
        id: user.id,
        name: user.name,
        username: user.username,
        roleId: user.roleId,
        roleCode: user.role.code,
        permissions: authUser.permissions,
        sessionId: familyId,
      }),
      refreshToken,
      expiresIn: this.tokens.accessTtlSeconds,
      user: authUser,
    };
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: { id: user.role.id, code: user.role.code, name: user.role.name },
      permissions: toPermissions(user.role.permissions),
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
