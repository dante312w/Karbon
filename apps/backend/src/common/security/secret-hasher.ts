import bcrypt from 'bcryptjs';

/**
 * Se usa bcryptjs (implementación JS pura del mismo algoritmo bcrypt) para no depender de
 * módulos nativos: el backend se empaqueta dentro del instalador de Electron.
 */
const BCRYPT_COST = 12;

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_COST);
}

export function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}
