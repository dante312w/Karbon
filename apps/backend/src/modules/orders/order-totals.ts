import { DiscountType } from '@karbon/types';
import {
  type CalculatedTotals,
  calculateOrderTotals,
  lineAmount,
  type OrderDiscountRule,
  practicalUnit,
} from '@karbon/utils';
import { num } from '../../common/mapping.js';
import { decimalToMinor, minorToDecimal } from '../../common/money.js';
import type {
  Order,
  OrderItem,
  Prisma,
  RestaurantSettings,
} from '../../generated/prisma/client.js';

type PricedItem = Pick<OrderItem, 'unitPrice' | 'quantity' | 'taxRate' | 'discount'>;
type PricedOrder = Pick<Order, 'tipPercent' | 'orderDiscountType' | 'orderDiscountValue'>;

/** Descuento del pedido en la forma de `calculateOrderTotals` (porcentaje o unidades menores). */
export function orderDiscountRule(order: PricedOrder, currency: string): OrderDiscountRule | null {
  if (!order.orderDiscountType || !order.orderDiscountValue) return null;
  return {
    type: order.orderDiscountType,
    value:
      order.orderDiscountType === DiscountType.PERCENT
        ? num(order.orderDiscountValue)
        : decimalToMinor(order.orderDiscountValue, currency),
  };
}

/**
 * Totales de un pedido a partir de sus ítems guardados, con la misma función que usan los
 * clientes. Lo usan el recálculo del pedido y el desglose de impuestos del comprobante.
 */
export function orderTotals(
  items: readonly PricedItem[],
  order: PricedOrder,
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
      tipPercent: num(order.tipPercent),
      tipRoundingUnit: practicalUnit(currency),
      orderDiscount: orderDiscountRule(order, currency),
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
