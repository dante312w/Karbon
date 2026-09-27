import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InvalidLicenseError,
  type LicensePayload,
  signLicense,
  verifyLicense,
} from './license-key.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PAYLOAD: LicensePayload = {
  licensee: 'La Brasa S.A.S.',
  plan: 'pro',
  maxTerminals: 5,
  expiresAt: '2027-09-26T00:00:00.000Z',
  issuedAt: '2026-09-26T00:00:00.000Z',
  branchId: null,
};

describe('licencias firmadas', () => {
  it('verifica una licencia emitida con la clave privada correspondiente', () => {
    expect(verifyLicense(signLicense(PAYLOAD, privateKey), publicKey)).toEqual(PAYLOAD);
  });

  it('rechaza una licencia alterada (p. ej. más terminales)', () => {
    const [prefix = '', , signature = ''] = signLicense(PAYLOAD, privateKey).split('.');
    const forged = Buffer.from(JSON.stringify({ ...PAYLOAD, maxTerminals: 99 })).toString(
      'base64url',
    );
    expect(() => verifyLicense(`${prefix}.${forged}.${signature}`, publicKey)).toThrow(
      InvalidLicenseError,
    );
  });

  it('rechaza licencias firmadas por otra clave', () => {
    const other = generateKeyPairSync('ed25519');
    expect(() => verifyLicense(signLicense(PAYLOAD, other.privateKey), publicKey)).toThrow('firma');
  });

  it('rechaza textos que no son licencias', () => {
    expect(() => verifyLicense('hola', publicKey)).toThrow('formato');
  });
});
