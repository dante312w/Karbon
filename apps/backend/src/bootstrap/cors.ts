import { DESKTOP_APP_ORIGIN } from '@karbon/types';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Hosts de red privada (RFC 1918), loopback y mDNS. El servidor solo atiende la LAN del
 * restaurante, así que esos orígenes se aceptan siempre (terminales, KDS, Vite en desarrollo).
 */
const PRIVATE_HOST =
  /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|[a-z0-9-]+\.local)$/i;

export function parseOriginList(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);
}

export function isAllowedOrigin(origin: string, extraOrigins: readonly string[]): boolean {
  if (origin === DESKTOP_APP_ORIGIN || extraOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && PRIVATE_HOST.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export type OriginChecker = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void;

/** Verificador compartido por la API REST y Socket.io. */
export function lanOriginChecker(corsOriginsSetting: string): OriginChecker {
  const extraOrigins = parseOriginList(corsOriginsSetting);
  return (origin, callback) => {
    // Sin cabecera Origin: misma página (PWA servida por este backend) o clientes no navegador.
    callback(null, origin === undefined || isAllowedOrigin(origin, extraOrigins));
  };
}

export function buildCorsOptions(corsOriginsSetting: string): CorsOptions {
  return {
    origin: lanOriginChecker(corsOriginsSetting),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  };
}
