import { fromMinorUnits, toMinorUnits } from '@karbon/utils';

export function formatTime(iso: string, locale = 'es-CO'): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string, locale = 'es-CO'): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(iso: string, locale = 'es-CO'): string {
  return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
}

export function formatQuantity(value: number, locale = 'es-CO'): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 3 });
}

const UNIT_LABEL: Record<string, string> = {
  UNIT: 'und',
  GRAM: 'g',
  KILOGRAM: 'kg',
  MILLILITER: 'ml',
  LITER: 'l',
};

export function unitLabel(unit: string): string {
  return UNIT_LABEL[unit] ?? unit;
}

/** Texto del usuario ("25.000", "25000,50") a unidades menores. */
export function parseMoney(text: string, currency: string): number | null {
  const normalized = text.replace(/[^\d.,-]/g, '');
  if (!normalized) return null;
  // Separador decimal = el último "," o "." seguido de 1–2 dígitos al final.
  const decimal = /[.,](\d{1,2})$/.exec(normalized);
  const integerPart = (decimal ? normalized.slice(0, decimal.index) : normalized).replace(
    /[.,]/g,
    '',
  );
  const value = Number(`${integerPart}${decimal ? `.${decimal[1] ?? ''}` : ''}`);
  return Number.isFinite(value) ? toMinorUnits(value, currency) : null;
}

export function moneyToInput(amount: number, currency: string): string {
  return String(fromMinorUnits(amount, currency));
}

/** Costos unitarios de insumos (unidades mayores, hasta 4 decimales: $0,0250 por gramo). */
export function formatUnitCost(value: number, currency: string, locale = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

/** Valor en unidades mayores (p. ej. stock × costo promedio) como texto de dinero. */
export function formatMajor(value: number, currency: string, locale = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
