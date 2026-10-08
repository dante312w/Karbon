import type { MinorUnits } from '@karbon/types';
import { assertMinorUnits, currencyExponent } from '@karbon/utils';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Frontera entre la base de datos (DECIMAL en unidades mayores) y los contratos de la API
 * (enteros en unidades menores). Ninguna otra capa debe convertir dinero.
 */
export function decimalToMinor(value: Prisma.Decimal, currency: string): MinorUnits {
  const minor = value.mul(new Prisma.Decimal(10).pow(currencyExponent(currency)));
  if (!minor.isInteger()) {
    throw new RangeError(`El monto ${value.toString()} excede la precisión de ${currency}`);
  }
  return minor.toNumber();
}

export function minorToDecimal(amount: MinorUnits, currency: string): Prisma.Decimal {
  assertMinorUnits(amount);
  return new Prisma.Decimal(amount).div(new Prisma.Decimal(10).pow(currencyExponent(currency)));
}
