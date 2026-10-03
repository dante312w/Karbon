import type { IsoDate, IsoDateTime } from '@karbon/types';
import type { Prisma } from '../generated/prisma/client.js';

export function iso(date: Date): IsoDateTime {
  return date.toISOString();
}

export function isoOrNull(date: Date | null): IsoDateTime | null {
  return date ? date.toISOString() : null;
}

/** Columnas DATE: Prisma las entrega como medianoche UTC. */
export function dateOnly(date: Date | null): IsoDate | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Cantidades y tarifas: la precisión de la columna (≤ 4 decimales) cabe en un double. */
export function num(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function numOrNull(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

export function timestamps(entity: { createdAt: Date; updatedAt: Date }): {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
} {
  return { createdAt: iso(entity.createdAt), updatedAt: iso(entity.updatedAt) };
}
