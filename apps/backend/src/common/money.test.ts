import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { decimalToMinor, minorToDecimal } from './money.js';

describe('conversión DECIMAL ↔ unidades menores', () => {
  it('convierte pesos colombianos en ambos sentidos sin pérdida', () => {
    expect(decimalToMinor(new Prisma.Decimal('25000.00'), 'COP')).toBe(2_500_000);
    expect(minorToDecimal(2_500_000, 'COP').toFixed(2)).toBe('25000.00');
  });

  it('respeta monedas sin decimales', () => {
    expect(decimalToMinor(new Prisma.Decimal('15990'), 'CLP')).toBe(15_990);
    expect(minorToDecimal(15_990, 'CLP').toFixed(0)).toBe('15990');
  });

  it('conserva centavos exactos donde el binario fallaría', () => {
    expect(decimalToMinor(new Prisma.Decimal('0.29'), 'USD')).toBe(29);
    expect(decimalToMinor(new Prisma.Decimal('1.005').toDecimalPlaces(2), 'USD')).toBe(101);
  });

  it('rechaza montos con más precisión que la moneda y enteros inválidos', () => {
    expect(() => decimalToMinor(new Prisma.Decimal('10.5'), 'CLP')).toThrow(RangeError);
    expect(() => minorToDecimal(10.5, 'COP')).toThrow(RangeError);
  });
});
