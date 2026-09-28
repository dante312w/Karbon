import {
  type CalculatedTotals,
  calculateOrderTotals,
  lineAmount,
  practicalUnit,
} from '@karbon/utils';
import { num } from '../../common/mapping.js';
import { decimalToMinor, minorToDecimal } from '../../common/money.js';
import type { OrderItem, Prisma, RestaurantSettings } from '../../generated/prisma/client.js';

type PricedItem = Pick<OrderItem, 'unitPrice' | 'quantity' | 'taxRate' | 'discount'>;

/**
 * Totales de un pedido a partir de sus ítems guardados, con la misma función que usan los
 * clientes. Lo usan el recálculo del pedido y el desglose de impuestos del comprobante.
 */
export function orderTotals(
  items: readonly PricedItem[],
  tipPercent: Prisma.Decimal,
  settings: Pick<RestaurantSettings, 'currency' | 'pricesIncludeTax'>,
): CalculatedTotals {
  const { currency } = settings;
  return calculateOrderTotals(
    items.map((item) => ({
      unitPrice: decimalToMinor(item.unitPrice, currency),
      quantity: item.quantity,
      taxRate: num(item.taxRate),
      discount: decimalToMinor(item.discount, currency),
    })),
    {
      pricesIncludeTax: settings.pricesIncludeTax,
      tipPercent: num(tipPercent),
      tipRoundingUnit: practicalUnit(currency),
    },
  );
}

/** Total de una línea (precio × cantidad − descuento) en DECIMAL. */
export function lineTotal(
  unitPrice: Prisma.Decimal,
  quantity: number,
  discount: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  const amount = lineAmount({
    unitPrice: decimalToMinor(unitPrice, currency),
    quantity,
    taxRate: 0,
    discount: decimalToMinor(discount, currency),
  });
  return minorToDecimal(amount, currency);
}
