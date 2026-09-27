import type { MinorUnits, Percentage } from '@karbon/types';

/**
 * Aritmética de dinero sobre enteros en unidades menores. Los porcentajes se llevan a
 * puntos básicos (1 % = 100 pb) para que toda operación sea entera y el redondeo exacto.
 */

/** 100 % expresado en puntos básicos. */
const FULL_PERCENT_BP = 10_000;

export function assertMinorUnits(value: number, label = 'monto'): asserts value is MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`El ${label} debe ser un entero en unidades menores; se recibió ${value}`);
  }
}

/** Convierte un porcentaje (8.5) a puntos básicos (850). Admite hasta 2 decimales. */
export function toBasisPoints(percentage: Percentage): number {
  const basisPoints = Math.round(percentage * 100);
  if (!Number.isFinite(percentage) || Math.abs(basisPoints - percentage * 100) > 1e-6) {
    throw new RangeError(`El porcentaje admite máximo 2 decimales; se recibió ${percentage}`);
  }
  return basisPoints;
}

/** División entera con redondeo "half away from zero", el usual en facturación. */
export function divideAndRound(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('divideAndRound requiere enteros seguros y denominador positivo');
  }
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return Math.abs(remainder) * 2 >= denominator ? quotient + Math.sign(numerator) : quotient;
}

export function sumMinor(amounts: readonly MinorUnits[]): MinorUnits {
  let total = 0;
  for (const amount of amounts) {
    assertMinorUnits(amount);
    total += amount;
  }
  return total;
}

export function multiplyMinor(amount: MinorUnits, quantity: number): MinorUnits {
  assertMinorUnits(amount);
  assertMinorUnits(quantity, 'cantidad');
  return amount * quantity;
}

/** `percentage` % de `amount`, redondeado a la unidad menor. */
export function percentOf(amount: MinorUnits, percentage: Percentage): MinorUnits {
  assertMinorUnits(amount);
  return divideAndRound(amount * toBasisPoints(percentage), FULL_PERCENT_BP);
}

/** Separa el impuesto contenido en un precio que ya lo incluye. */
export function splitTaxFromGross(
  gross: MinorUnits,
  ratePercentage: Percentage,
): { net: MinorUnits; tax: MinorUnits } {
  assertMinorUnits(gross);
  const net = divideAndRound(
    gross * FULL_PERCENT_BP,
    FULL_PERCENT_BP + toBasisPoints(ratePercentage),
  );
  return { net, tax: gross - net };
}

/**
 * Reparte `total` en partes proporcionales a `weights` sin perder ni crear centavos:
 * el residuo se asigna a las partes con mayor fracción descartada. Base de "dividir cuenta".
 */
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  assertMinorUnits(total);
  if (weights.length === 0 || weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('allocate requiere al menos un peso y todos no negativos');
  }
  const weightSum = weights.reduce((acc, w) => acc + w, 0);
  if (weightSum === 0) {
    throw new RangeError('La suma de los pesos debe ser mayor que cero');
  }

  const exact = weights.map((w) => (total * w) / weightSum);
  const parts = exact.map((value) => Math.trunc(value));
  let remainder = total - parts.reduce((acc, p) => acc + p, 0);

  const byFraction = exact
    .map((value, index) => ({ index, fraction: Math.abs(value - Math.trunc(value)) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const step = Math.sign(remainder);
  for (const { index } of byFraction) {
    if (remainder === 0) break;
    parts[index] = (parts[index] ?? 0) + step;
    remainder -= step;
  }
  return parts;
}

/** Reparte `total` en `count` partes iguales (la diferencia de centavos va a las primeras). */
export function splitEvenly(total: MinorUnits, count: number): MinorUnits[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('La cuenta se divide en al menos 1 parte');
  }
  return allocate(
    total,
    Array.from({ length: count }, () => 1),
  );
}

/**
 * Decimales ISO 4217 por moneda. Tabla explícita a propósito: `Intl.NumberFormat` usa datos
 * CLDR que cambian entre versiones de ICU (algunas reportan 0 decimales para COP), y backend,
 * Electron y navegadores deben convertir exactamente igual.
 */
const ISO_4217_EXPONENTS: Readonly<Record<string, number>> = {
  ARS: 2,
  BOB: 2,
  BRL: 2,
  CLP: 0,
  COP: 2,
  CRC: 2,
  DOP: 2,
  EUR: 2,
  GTQ: 2,
  JPY: 0,
  MXN: 2,
  PAB: 2,
  PEN: 2,
  PYG: 0,
  USD: 2,
  UYU: 2,
};

export const SUPPORTED_CURRENCIES: readonly string[] = Object.freeze(
  Object.keys(ISO_4217_EXPONENTS),
);

/**
 * Menor fracción que se cobra en la práctica, en unidades menores. En pesos colombianos no
 * circulan centavos: los montos que se calculan (propina) se redondean a pesos enteros.
 */
const PRACTICAL_UNIT_MINOR: Readonly<Record<string, MinorUnits>> = { COP: 100 };

export function practicalUnit(currency: string): MinorUnits {
  return PRACTICAL_UNIT_MINOR[currency] ?? 1;
}

/** Redondea al múltiplo más cercano de `unit` (mitades hacia arriba). */
export function roundToUnit(amount: MinorUnits, unit: MinorUnits): MinorUnits {
  if (!Number.isInteger(unit) || unit < 1)
    throw new RangeError('La unidad de redondeo debe ser un entero positivo');
  return Math.round(amount / unit) * unit;
}

export function currencyExponent(currency: string): number {
  const exponent = ISO_4217_EXPONENTS[currency];
  if (exponent === undefined) {
    throw new RangeError(`Moneda no soportada: ${currency}`);
  }
  return exponent;
}

export function toMinorUnits(amount: number, currency: string): MinorUnits {
  const factor = 10 ** currencyExponent(currency);
  const scaled = amount * factor;
  // Corrige errores binarios como 1.005 * 100 = 100.49999999999999.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9);
  return rounded === 0 ? 0 : rounded;
}

export function fromMinorUnits(amount: MinorUnits, currency: string): number {
  assertMinorUnits(amount);
  return amount / 10 ** currencyExponent(currency);
}

export interface MoneyFormatOptions {
  currency: string;
  locale: string;
  /** Decimales visibles. Por defecto se ocultan cuando el monto no tiene fracción. */
  fractionDigits?: number;
}

export function formatMoney(amount: MinorUnits, options: MoneyFormatOptions): string {
  const major = fromMinorUnits(amount, options.currency);
  const digits =
    options.fractionDigits ?? (Number.isInteger(major) ? 0 : currencyExponent(options.currency));
  return new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: options.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}
