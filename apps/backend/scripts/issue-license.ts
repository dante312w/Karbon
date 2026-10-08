/**
 * Emisión de licencias (uso interno del proveedor, nunca en el equipo del cliente).
 *
 *   npm run license:issue -w @karbon/backend -- --licensee "La Brasa S.A.S." --plan pro \
 *     --terminals 5 --days 365 [--branch <branchId>] [--key ruta/privada.pem]
 *
 * La clave privada por defecto es apps/backend/.secrets/license-private.pem (ignorada por git).
 */
import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { signLicense } from '../src/modules/license/license-key.js';

const { values } = parseArgs({
  options: {
    licensee: { type: 'string' },
    plan: { type: 'string', default: 'pro' },
    terminals: { type: 'string' },
    days: { type: 'string' },
    branch: { type: 'string' },
    key: { type: 'string', default: '.secrets/license-private.pem' },
  },
});

if (!values.licensee) {
  console.error('Falta --licensee "Razón social"');
  process.exit(1);
}

const days = values.days ? Number(values.days) : null;
const license = signLicense(
  {
    licensee: values.licensee,
    plan: values.plan,
    maxTerminals: values.terminals ? Number(values.terminals) : null,
    expiresAt: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null,
    issuedAt: new Date().toISOString(),
    branchId: values.branch ?? null,
  },
  createPrivateKey(readFileSync(values.key)),
);
console.log(license);
