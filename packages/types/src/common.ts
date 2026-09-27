/** Identificador UUID (v7 para entidades; ordenable por tiempo). */
export type Uuid = string;

/** Fecha-hora ISO 8601 en UTC, p. ej. `2026-09-25T18:30:00.000Z`. */
export type IsoDateTime = string;

/** Fecha calendario ISO 8601, p. ej. `2026-09-25`. */
export type IsoDate = string;

/**
 * Monto de dinero en unidades menores de la moneda (centavos). Siempre entero.
 * La base de datos guarda `DECIMAL(14,2)`; la conversión ocurre solo en el backend.
 */
export type MinorUnits = number;

/** Costo unitario de un insumo en unidades mayores por unidad de medida (hasta 4 decimales). */
export type UnitCost = number;

/** Cantidad de inventario en la unidad de medida del insumo (hasta 3 decimales). */
export type Quantity = number;

/** Porcentaje expresado en base 100 (8 = 8 %). */
export type Percentage = number;

export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Cuerpo estándar de error de la API REST. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Código estable legible por máquina, p. ej. `ORDER_VERSION_CONFLICT`. */
  code?: string;
  details?: unknown;
  path: string;
  timestamp: IsoDateTime;
  requestId?: string;
}

export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
