import type { MinorUnits, OrderTotals, Percentage } from '@karbon/types';
import {
  assertMinorUnits,
  multiplyMinor,
  percentOf,
  roundToUnit,
  splitTaxFromGross,
  sumMinor,
  toBasisPoints,
} from './money.js';

export interface TotalsLine {
  unitPrice: MinorUnits;
  quantity: number;
  taxRate: Percentage;
  /** Descuento sobre el total de la línea, en el mismo régimen (con o sin impuesto) que el precio. */
  discount?: MinorUnits;
}

export interface TotalsOptions {
  /** Si `true`, los precios de carta ya incluyen el impuesto (usual en restaurantes en Colombia). */
  pricesIncludeTax: boolean;
  /** Propina sugerida sobre el subtotal antes de impuestos. `0` u omitido = sin propina. */
  tipPercent?: Percentage;
  /** Unidad a la que se redondea la propina (ver `practicalUnit`). Por defecto, sin redondeo. */
  tipRoundingUnit?: MinorUnits;
}

export interface TaxBreakdownEntry {
  rate: Percentage;
  base: MinorUnits;
  amount: MinorUnits;
}

export interface CalculatedTotals extends OrderTotals {
  taxBreakdown: TaxBreakdownEntry[];
}

/** Total de una línea antes de separar impuestos: precio × cantidad − descuento. */
export function lineAmount(line: TotalsLine): MinorUnits {
  if (line.quantity <= 0) throw new RangeError('La cantidad debe ser mayor que cero');
  const gross = multiplyMinor(line.unitPrice, line.quantity);
  const discount = line.discount ?? 0;
  assertMinorUnits(discount, 'descuento');
  if (discount < 0 || discount > gross) {
    throw new RangeError('El descuento debe estar entre 0 y el total de la línea');
  }
  return gross - discount;
}

/**
 * Calcula los totales de un pedido. El impuesto se calcula por tarifa agrupada (no por
 * línea) para que el desglose coincida con el comprobante y minimizar el error de redondeo.
 * Es la misma función en backend (fuente de verdad) y en clientes (vista previa).
 */
export function calculateOrderTotals(
  lines: readonly TotalsLine[],
  options: TotalsOptions,
): CalculatedTotals {
  const amountByRate = new Map<number, { rate: Percentage; amount: MinorUnits }>();
  let discountTotal = 0;

  for (const line of lines) {
    const amount = lineAmount(line);
    discountTotal += line.discount ?? 0;
    const key = toBasisPoints(line.taxRate);
    const group = amountByRate.get(key) ?? { rate: line.taxRate, amount: 0 };
    group.amount += amount;
    amountByRate.set(key, group);
  }

  const taxBreakdown = [...amountByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, { rate, amount }]): TaxBreakdownEntry => {
      if (options.pricesIncludeTax) {
        const { net, tax } = splitTaxFromGross(amount, rate);
        return { rate, base: net, amount: tax };
      }
      return { rate, base: amount, amount: percentOf(amount, rate) };
    });

  const subtotal = sumMinor(taxBreakdown.map((entry) => entry.base));
  const taxTotal = sumMinor(taxBreakdown.map((entry) => entry.amount));
  const tipAmount = options.tipPercent
    ? roundToUnit(percentOf(subtotal, options.tipPercent), options.tipRoundingUnit ?? 1)
    : 0;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    tipAmount,
    total: subtotal + taxTotal + tipAmount,
    taxBreakdown,
  };
}
