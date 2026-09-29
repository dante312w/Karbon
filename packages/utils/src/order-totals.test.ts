import { describe, expect, it } from 'vitest';
import { DiscountType } from '@karbon/types';
import {
  calculateOrderTotals,
  discountPercent,
  exceedsDiscountLimit,
  lineAmount,
  orderDiscountAmount,
} from './order-totals.js';
import { practicalUnit } from './money.js';

const BURGER = { unitPrice: 2_500_000, taxRate: 8 };
const SODA = { unitPrice: 500_000, taxRate: 8 };

describe('calculateOrderTotals', () => {
  it('pedido vacío', () => {
    expect(calculateOrderTotals([], { pricesIncludeTax: true })).toEqual({
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      tipAmount: 0,
      total: 0,
      taxBreakdown: [],
      grossAmount: 0,
      orderDiscountAmount: 0,
    });
  });

  it('precios con impuesto incluido: el total es el precio de carta', () => {
    const totals = calculateOrderTotals(
      [
        { ...BURGER, quantity: 2 },
        { ...SODA, quantity: 1 },
      ],
      { pricesIncludeTax: true },
    );
    expect(totals.total).toBe(5_500_000);
    expect(totals.subtotal).toBe(5_092_593);
    expect(totals.taxTotal).toBe(407_407);
    expect(totals.taxBreakdown).toEqual([{ rate: 8, base: 5_092_593, amount: 407_407 }]);
  });

  it('la propina se calcula sobre el subtotal antes de impuestos', () => {
    const totals = calculateOrderTotals(
      [
        { ...BURGER, quantity: 2 },
        { ...SODA, quantity: 1 },
      ],
      { pricesIncludeTax: true, tipPercent: 10 },
    );
    expect(totals.tipAmount).toBe(509_259);
    expect(totals.total).toBe(5_500_000 + 509_259);
  });

  it('precios sin impuesto: agrupa por tarifa y suma el impuesto', () => {
    const totals = calculateOrderTotals(
      [
        { unitPrice: 10_000, quantity: 1, taxRate: 19 },
        { unitPrice: 5_000, quantity: 2, taxRate: 0 },
      ],
      { pricesIncludeTax: false },
    );
    expect(totals.taxBreakdown).toEqual([
      { rate: 0, base: 10_000, amount: 0 },
      { rate: 19, base: 10_000, amount: 1_900 },
    ]);
    expect(totals.subtotal).toBe(20_000);
    expect(totals.taxTotal).toBe(1_900);
    expect(totals.total).toBe(21_900);
  });

  it('aplica descuentos de línea y los reporta en discountTotal', () => {
    const totals = calculateOrderTotals(
      [{ unitPrice: 10_000, quantity: 2, taxRate: 0, discount: 5_000 }],
      { pricesIncludeTax: true },
    );
    expect(totals.discountTotal).toBe(5_000);
    expect(totals.total).toBe(15_000);
  });

  it('el desglose siempre cuadra con el total', () => {
    const totals = calculateOrderTotals(
      [
        { unitPrice: 333_333, quantity: 3, taxRate: 8 },
        { unitPrice: 777_777, quantity: 1, taxRate: 19 },
        { unitPrice: 123_456, quantity: 7, taxRate: 0 },
      ],
      { pricesIncludeTax: true, tipPercent: 10 },
    );
    expect(totals.subtotal + totals.taxTotal + totals.tipAmount).toBe(totals.total);
    expect(totals.total - totals.tipAmount).toBe(333_333 * 3 + 777_777 + 123_456 * 7);
  });
});

describe('lineAmount', () => {
  it('rechaza cantidades no positivas y descuentos inválidos', () => {
    expect(() => lineAmount({ unitPrice: 1_000, quantity: 0, taxRate: 0 })).toThrow(RangeError);
    expect(() =>
      lineAmount({ unitPrice: 1_000, quantity: 1, taxRate: 0, discount: 1_001 }),
    ).toThrow(RangeError);
    expect(() => lineAmount({ unitPrice: 1_000, quantity: 1, taxRate: 0, discount: -1 })).toThrow(
      RangeError,
    );
  });
});

describe('propina redondeada a la unidad práctica', () => {
  it('en pesos colombianos no deja centavos en la propina ni en el total', () => {
    // 2 hamburguesas de $25.000 + gaseosa $5.000, precios con impuesto al consumo del 8 %.
    const totals = calculateOrderTotals(
      [
        { unitPrice: 2_500_000, quantity: 2, taxRate: 8 },
        { unitPrice: 500_000, quantity: 1, taxRate: 8 },
      ],
      { pricesIncludeTax: true, tipPercent: 10, tipRoundingUnit: practicalUnit('COP') },
    );
    expect(totals.subtotal).toBe(5_092_593);
    expect(totals.tipAmount).toBe(509_300);
    expect(totals.total).toBe(6_009_300);
  });

  it('sin unidad de redondeo conserva la precisión en centavos (USD)', () => {
    const totals = calculateOrderTotals([{ unitPrice: 1_234, quantity: 1, taxRate: 0 }], {
      pricesIncludeTax: false,
      tipPercent: 10,
      tipRoundingUnit: practicalUnit('USD'),
    });
    expect(totals.tipAmount).toBe(123);
  });
});

describe('descuento sobre el total del pedido', () => {
  const percent = (value: number) => ({ type: DiscountType.PERCENT, value });
  const amount = (value: number) => ({ type: DiscountType.AMOUNT, value });

  it('10 % sobre $100.000 con impuesto incluido deja $90.000', () => {
    const totals = calculateOrderTotals([{ ...BURGER, unitPrice: 10_000_000, quantity: 1 }], {
      pricesIncludeTax: true,
      orderDiscount: percent(10),
    });
    expect(totals.orderDiscountAmount).toBe(1_000_000);
    expect(totals.discountTotal).toBe(1_000_000);
    expect(totals.total).toBe(9_000_000);
    expect(totals.grossAmount).toBe(10_000_000);
  });

  it('se reparte entre tarifas: cada impuesto se calcula sobre lo que se cobra', () => {
    const totals = calculateOrderTotals(
      [
        { unitPrice: 6_000_000, quantity: 1, taxRate: 19 },
        { unitPrice: 4_000_000, quantity: 1, taxRate: 0 },
      ],
      { pricesIncludeTax: false, orderDiscount: amount(1_000_000) },
    );
    expect(totals.taxBreakdown).toEqual([
      { rate: 0, base: 3_600_000, amount: 0 },
      { rate: 19, base: 5_400_000, amount: 1_026_000 },
    ]);
    expect(totals.subtotal).toBe(9_000_000);
    expect(totals.total).toBe(10_026_000);
  });

  it('se suma a los descuentos de línea y la propina va sobre lo descontado', () => {
    const totals = calculateOrderTotals(
      [{ unitPrice: 10_000, quantity: 2, taxRate: 0, discount: 5_000 }],
      { pricesIncludeTax: true, tipPercent: 10, orderDiscount: percent(20) },
    );
    expect(totals.orderDiscountAmount).toBe(3_000);
    expect(totals.discountTotal).toBe(8_000);
    expect(totals.tipAmount).toBe(1_200);
    expect(totals.total).toBe(13_200);
    expect(discountPercent(totals)).toBe(40);
  });

  it('un valor fijo mayor que la cuenta la deja en cero, nunca negativa', () => {
    expect(orderDiscountAmount(5_000, amount(9_000))).toBe(5_000);
    expect(orderDiscountAmount(0, percent(10))).toBe(0);
    const totals = calculateOrderTotals([{ ...SODA, quantity: 1 }], {
      pricesIncludeTax: true,
      orderDiscount: amount(10_000_000),
    });
    expect(totals.total).toBe(0);
  });

  it('el límite se compara con el mismo redondeo: el máximo exacto se acepta', () => {
    const totals = calculateOrderTotals([{ unitPrice: 3_333, quantity: 3, taxRate: 0 }], {
      pricesIncludeTax: true,
      orderDiscount: percent(10),
    });
    expect(exceedsDiscountLimit(totals, 10)).toBe(false);
    expect(exceedsDiscountLimit(totals, 9.99)).toBe(true);
  });

  it('rechaza porcentajes fuera de rango y valores no enteros', () => {
    expect(() => orderDiscountAmount(1_000, percent(0))).toThrow(RangeError);
    expect(() => orderDiscountAmount(1_000, percent(120))).toThrow(RangeError);
    expect(() => orderDiscountAmount(1_000, amount(10.5))).toThrow(RangeError);
  });
});
