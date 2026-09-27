import type { Uuid } from './common.js';
import type { Permission } from './permissions.js';

export interface LoginRequest {
  username: string;
  password: string;
  deviceName?: string;
}

/** Ingreso rápido en terminales compartidas: se elige el usuario y se digita el PIN. */
export interface PinLoginRequest {
  userId: Uuid;
  pin: string;
  deviceName?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token en segundos. */
  expiresIn: number;
}

export interface AuthUser {
  id: Uuid;
  name: string;
  username: string;
  role: { id: Uuid; code: string; name: string };
  permissions: Permission[];
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

/** Usuario elegible en la pantalla de ingreso por PIN. */
export interface PinUserOption {
  id: Uuid;
  name: string;
  roleCode: string;
  roleName: string;
}
