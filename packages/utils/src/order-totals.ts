import { DiscountType, type MinorUnits, type OrderTotals, type Percentage } from '@karbon/types';
import {
  allocate,
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

/** Descuento sobre el total: `value` es un porcentaje (PERCENT) o un valor en unidades menores. */
export interface OrderDiscountRule {
  type: DiscountType;
  value: number;
}

export interface TotalsOptions {
  /** Si `true`, los precios de carta ya incluyen el impuesto (usual en restaurantes en Colombia). */
  pricesIncludeTax: boolean;
  /** Propina sugerida sobre el subtotal antes de impuestos. `0` u omitido = sin propina. */
  tipPercent?: Percentage;
  /** Unidad a la que se redondea la propina (ver `practicalUnit`). Por defecto, sin redondeo. */
  tipRoundingUnit?: MinorUnits;
  /** Descuento sobre el total del pedido, después de los descuentos de línea. */
  orderDiscount?: OrderDiscountRule | null;
}

export interface TaxBreakdownEntry {
  rate: Percentage;
  base: MinorUnits;
  amount: MinorUnits;
}

export interface CalculatedTotals extends OrderTotals {
  taxBreakdown: TaxBreakdownEntry[];
  /** Precio × cantidad de todas las líneas, antes de cualquier descuento. */
  grossAmount: MinorUnits;
  /** Lo que descuenta el descuento del pedido (incluido en `discountTotal`). */
  orderDiscountAmount: MinorUnits;
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
 * Valor del descuento del pedido sobre `base` (lo que suman las líneas ya con sus descuentos).
 * Un valor fijo mayor que la base se limita a la base: el total nunca queda negativo.
 */
export function orderDiscountAmount(
  base: MinorUnits,
  rule: OrderDiscountRule | null | undefined,
): MinorUnits {
  if (!rule || base <= 0) return 0;
  if (rule.type === DiscountType.PERCENT) {
    if (rule.value <= 0 || rule.value > 100) {
      throw new RangeError('El porcentaje de descuento debe estar entre 0 y 100');
    }
    return percentOf(base, rule.value);
  }
  assertMinorUnits(rule.value, 'descuento');
  if (rule.value <= 0) throw new RangeError('El descuento debe ser mayor que cero');
  return Math.min(rule.value, base);
}

/** Porcentaje que representan todos los descuentos (línea + pedido) sobre el valor sin descuentos. */
export function discountPercent(
  totals: Pick<CalculatedTotals, 'discountTotal' | 'grossAmount'>,
): number {
  return totals.grossAmount === 0 ? 0 : (totals.discountTotal / totals.grossAmount) * 100;
}

/** "10 %" o "$ 5.000" (con el formateador de dinero del negocio). */
export function describeOrderDiscount(
  discount: OrderDiscountRule,
  money: (amount: MinorUnits) => string,
): string {
  return discount.type === DiscountType.PERCENT
    ? `${String(discount.value)} %`
    : money(discount.value);
}

/**
 * ¿Los descuentos (línea + pedido) superan el máximo configurado? Se compara en unidades menores
 * con el mismo redondeo del cálculo: un 10 % exacto no falla por un peso de redondeo.
 */
export function exceedsDiscountLimit(
  totals: Pick<CalculatedTotals, 'discountTotal' | 'grossAmount'>,
  maxPercent: Percentage,
): boolean {
  return totals.discountTotal > percentOf(totals.grossAmount, maxPercent);
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
  const amounts = lines.map(lineAmount);
  const base = sumMinor(amounts);
  // El descuento del pedido se reparte entre las líneas en proporción a su valor: así cada
  // tarifa de impuesto se calcula sobre lo que realmente se cobra.
  const orderDiscount = orderDiscountAmount(base, options.orderDiscount);
  const shares = orderDiscount > 0 ? allocate(orderDiscount, amounts) : amounts.map(() => 0);
  let discountTotal = orderDiscount;
  let grossAmount = 0;

  for (const [index, line] of lines.entries()) {
    const amount = (amounts[index] ?? 0) - (shares[index] ?? 0);
    discountTotal += line.discount ?? 0;
    grossAmount += multiplyMinor(line.unitPrice, line.quantity);
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
    grossAmount,
    orderDiscountAmount: orderDiscount,
  };
}
