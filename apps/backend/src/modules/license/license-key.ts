import { createPublicKey, type KeyObject, sign, verify } from 'node:crypto';

/**
 * Clave pública del emisor de licencias (Ed25519). La privada vive fuera del repositorio
 * (apps/backend/.secrets/, ignorada por git) y solo la usa el script de emisión.
 */
export const LICENSE_PUBLIC_KEY = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvtVIQ+XySeZxGJDLp8OA++oAUU0acOITm7EmQqIQUzc=
-----END PUBLIC KEY-----`);

const PREFIX = 'KARBON1';

export interface LicensePayload {
  licensee: string;
  plan: string;
  maxTerminals: number | null;
  /** ISO 8601; `null` = perpetua. */
  expiresAt: string | null;
  issuedAt: string;
  /** Instalación a la que se ata la licencia (`branchId`); `null` = cualquiera. */
  branchId: string | null;
}

export class InvalidLicenseError extends Error {}

function isPayload(value: unknown): value is LicensePayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.licensee === 'string' &&
    typeof candidate.plan === 'string' &&
    (candidate.maxTerminals === null || typeof candidate.maxTerminals === 'number') &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === 'string') &&
    typeof candidate.issuedAt === 'string' &&
    (candidate.branchId === null || typeof candidate.branchId === 'string')
  );
}

/** `KARBON1.<payload base64url>.<firma base64url>`: se valida sin conexión a internet. */
export function signLicense(payload: LicensePayload, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(`${PREFIX}.${body}`), privateKey).toString('base64url');
  return `${PREFIX}.${body}.${signature}`;
}

export function verifyLicense(
  key: string,
  publicKey: KeyObject = LICENSE_PUBLIC_KEY,
): LicensePayload {
  const [prefix, body, signature, ...rest] = key.trim().split('.');
  if (prefix !== PREFIX || !body || !signature || rest.length > 0) {
    throw new InvalidLicenseError('La clave de licencia no tiene el formato correcto');
  }
  const valid = verify(
    null,
    Buffer.from(`${PREFIX}.${body}`),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
  if (!valid) throw new InvalidLicenseError('La firma de la licencia no es válida');
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidLicenseError('La licencia está dañada');
  }
  if (!isPayload(payload)) throw new InvalidLicenseError('La licencia está incompleta');
  return payload;
}
