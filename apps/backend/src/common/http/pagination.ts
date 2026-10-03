import type { Paginated } from '@karbon/types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export function pageArgs(query: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Filtro por rango de fechas (`from` y `to` opcionales, inclusivos) sobre el campo indicado. */
export function dateRange<K extends string>(
  field: K,
  range: { from?: string | undefined; to?: string | undefined },
): Partial<Record<K, { gte?: Date; lte?: Date }>> {
  if (!range.from && !range.to) return {};
  const filter = {
    ...(range.from ? { gte: new Date(range.from) } : {}),
    ...(range.to ? { lte: new Date(range.to) } : {}),
  };
  return { [field]: filter } as Record<K, typeof filter>;
}

/** Filtro `contains` sin distinguir mayúsculas para búsquedas rápidas. */
export function containsInsensitive(search: string): { contains: string; mode: 'insensitive' } {
  return { contains: search.trim(), mode: 'insensitive' };
}
