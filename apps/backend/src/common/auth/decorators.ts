import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Permission } from '@karbon/types';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user.js';

export const IS_PUBLIC_KEY = 'karbon:public';
export const PERMISSIONS_KEY = 'karbon:permissions';
export const ANY_PERMISSION_KEY = 'karbon:any-permission';

/** Ruta sin autenticación (salud, ingreso, asistente de instalación). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige TODOS los permisos indicados. */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Exige AL MENOS UNO de los permisos indicados. */
export const RequireAnyPermission = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(ANY_PERMISSION_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException('Sesión requerida');
    return user;
  },
);
