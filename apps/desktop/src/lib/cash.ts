import { toMinorUnits } from '@karbon/utils';

/** Billetes habituales por moneda (unidades mayores) para sugerir el efectivo recibido. */
const BILLS: Readonly<Record<string, readonly number[]>> = {
  COP: [10_000, 20_000, 50_000, 100_000],
  USD: [5, 10, 20, 50, 100],
  EUR: [5, 10, 20, 50, 100],
  MXN: [50, 100, 200, 500, 1_000],
};

/** Montos redondeados hacia arriba con los que suele pagar un cliente (sin repetir el exacto). */
export function tenderedSuggestions(amount: number, currency: string, limit = 4): number[] {
  const bills = (BILLS[currency] ?? BILLS.USD ?? []).map((bill) => toMinorUnits(bill, currency));
  const options = new Set<number>();
  for (const bill of bills) {
    const rounded = Math.ceil(amount / bill) * bill;
    if (rounded > amount) options.add(rounded);
  }
  return [...options].sort((a, b) => a - b).slice(0, limit);
}
