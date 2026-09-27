import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isPermission, type Permission } from '@karbon/types';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';

interface AccessTokenPayload {
  sub: string;
  name: string;
  username: string;
  rid: string;
  rc: string;
  perms: string[];
  sid: string;
  /** Tipo de token: se valida en ejecución por si otro token firmado con el mismo secreto llega aquí. */
  typ: string;
}

/**
 * Los permisos viajan en el access token (vida corta) para no consultar la base en cada
 * solicitud; un cambio de rol se aplica en la siguiente renovación.
 */
@Injectable()
export class TokenService {
  readonly accessTtlSeconds: number;
  readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.refreshTtlMs = config.get('JWT_REFRESH_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  signAccessToken(user: AuthenticatedUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      rid: user.roleId,
      rc: user.roleCode,
      perms: user.permissions,
      sid: user.sessionId,
      typ: 'access',
    };
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSeconds });
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Token inválido');
    return {
      id: payload.sub,
      name: payload.name,
      username: payload.username,
      roleId: payload.rid,
      roleCode: payload.rc,
      permissions: payload.perms.filter((permission): permission is Permission =>
        isPermission(permission),
      ),
      sessionId: payload.sid,
    };
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
