import type { Request } from 'express';
import type { SessionMetadata } from './auth.service.js';

/** Límite estricto contra fuerza bruta de claves y PIN. */
export const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

export function sessionMetadata(request: Request, deviceName?: string): SessionMetadata {
  return {
    deviceName,
    userAgent: request.headers['user-agent'],
    ipAddress: request.ip,
  };
}
