import { describe, expect, it } from 'vitest';
import {
  allocate,
  assertMinorUnits,
  currencyExponent,
  divideAndRound,
  formatMoney,
  fromMinorUnits,
  percentOf,
  SUPPORTED_CURRENCIES,
  splitEvenly,
  splitTaxFromGross,
  sumMinor,
  toBasisPoints,
  toMinorUnits,
} from './money.js';

describe('divideAndRound', () => {
  it.each([
    [5, 2, 3],
    [-5, 2, -3],
    [4, 3, 1],
    [5, 3, 2],
    [7, 2, 4],
    [0, 7, 0],
  ])('%i / %i = %i (half away from zero)', (numerator, denominator, expected) => {
    expect(divideAndRound(numerator, denominator)).toBe(expected);
  });

  it('rechaza denominadores no positivos y valores no enteros', () => {
    expect(() => divideAndRound(1, 0)).toThrow(RangeError);
    expect(() => divideAndRound(1.5, 2)).toThrow(RangeError);
  });
});

describe('porcentajes', () => {
  it('convierte a puntos básicos y rechaza más de 2 decimales', () => {
    expect(toBasisPoints(8)).toBe(800);
    expect(toBasisPoints(8.5)).toBe(850);
    expect(toBasisPoints(19.99)).toBe(1999);
    expect(() => toBasisPoints(8.555)).toThrow(RangeError);
  });

  it.each([
    [10_000, 8, 800],
    [12_345, 8, 988],
    [1_250, 19, 238],
    [100, 8.5, 9],
    [-1_250, 19, -238],
  ])('%i × %d %% = %i', (amount, rate, expected) => {
    expect(percentOf(amount, rate)).toBe(expected);
  });
});

describe('splitTaxFromGross', () => {
  it('separa el IVA del 19 % de un precio con impuesto incluido', () => {
    expect(splitTaxFromGross(11_900, 19)).toEqual({ net: 10_000, tax: 1_900 });
  });

  it('separa el impoconsumo del 8 % sin perder centavos', () => {
    const { net, tax } = splitTaxFromGross(2_500_000, 8);
    expect(net).toBe(2_314_815);
    expect(net + tax).toBe(2_500_000);
  });

  it('con tarifa 0 todo es base', () => {
    expect(splitTaxFromGross(5_000, 0)).toEqual({ net: 5_000, tax: 0 });
  });
});

describe('allocate / splitEvenly', () => {
  it('reparte el residuo sin perder ni crear centavos', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1_000, [1, 2, 7])).toEqual([100, 200, 700]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('asigna el residuo a la mayor fracción descartada', () => {
    const parts = allocate(10, [3, 3, 4]);
    expect(parts).toEqual([3, 3, 4]);
    expect(sumMinor(allocate(99_999, [0.3, 0.3, 0.4]))).toBe(99_999);
  });

  it('divide la cuenta en partes iguales', () => {
    expect(splitEvenly(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitEvenly(10_000, 1)).toEqual([10_000]);
  });

  it('valida los argumentos', () => {
    expect(() => allocate(100, [])).toThrow(RangeError);
    expect(() => allocate(100, [0, 0])).toThrow(RangeError);
    expect(() => allocate(100, [-1, 2])).toThrow(RangeError);
    expect(() => splitEvenly(100, 0)).toThrow(RangeError);
  });
});

describe('conversión y formato de moneda', () => {
  it('usa los decimales ISO 4217 de cada moneda, sin depender de ICU', () => {
    expect(currencyExponent('COP')).toBe(2);
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('CLP')).toBe(0);
    expect(SUPPORTED_CURRENCIES).toContain('COP');
    expect(() => currencyExponent('XYZ')).toThrow(RangeError);
  });

  it('convierte entre unidades mayores y menores', () => {
    expect(toMinorUnits(25_000, 'COP')).toBe(2_500_000);
    expect(toMinorUnits(1.005, 'USD')).toBe(101);
    expect(toMinorUnits(-2.675, 'USD')).toBe(-268);
    expect(toMinorUnits(1_000, 'CLP')).toBe(1_000);
    expect(fromMinorUnits(2_500_000, 'COP')).toBe(25_000);
  });

  it('formatea pesos colombianos sin decimales cuando el monto es entero', () => {
    const formatted = formatMoney(2_500_000, { currency: 'COP', locale: 'es-CO' });
    expect(formatted).toMatch(/25\.000/);
    expect(formatted).not.toMatch(/,/);
  });

  it('muestra decimales cuando el monto tiene fracción', () => {
    expect(formatMoney(1_250, { currency: 'USD', locale: 'en-US' })).toBe('$12.50');
    expect(formatMoney(1_200, { currency: 'USD', locale: 'en-US', fractionDigits: 2 })).toBe(
      '$12.00',
    );
  });

  it('rechaza montos que no son enteros', () => {
    expect(() => {
      assertMinorUnits(10.5);
    }).toThrow(RangeError);
    expect(() => sumMinor([1, 2.5])).toThrow(RangeError);
  });
});
