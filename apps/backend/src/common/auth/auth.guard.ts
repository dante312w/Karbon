import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@karbon/types';
import { TokenService } from '../../modules/auth/token.service.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { ANY_PERMISSION_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from './decorators.js';

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Guard global: autentica con el access token y verifica los permisos RBAC de la ruta. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Sesión requerida');
    const user = this.tokens.verifyAccessToken(token);
    request.user = user;

    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((permission) => !user.permissions.includes(permission));
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(
      ANY_PERMISSION_KEY,
      targets,
    );
    const lacksAny =
      anyOf !== undefined && !anyOf.some((permission) => user.permissions.includes(permission));
    if (missing.length > 0 || lacksAny) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
