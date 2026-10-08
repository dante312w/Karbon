import type { Permission, Uuid } from '@karbon/types';
import type { Request } from 'express';

/** Identidad resuelta desde el access token en cada solicitud. */
export interface AuthenticatedUser {
  id: Uuid;
  name: string;
  username: string;
  roleId: Uuid;
  roleCode: string;
  permissions: Permission[];
  /** Familia de refresh tokens (sesión del dispositivo). */
  sessionId: Uuid;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
