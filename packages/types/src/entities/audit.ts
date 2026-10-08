import type { IsoDateTime, Uuid } from '../common.js';

/** Registro de la bitácora: quién hizo qué acción sensible, sobre qué y cuándo. */
export interface AuditLogDto {
  id: Uuid;
  /** `recurso.acción`, p. ej. `order.cancel` o `payment.void`. */
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userId: Uuid | null;
  /** Nombre del usuario al consultar (null si fue una acción del sistema o se eliminó). */
  userName: string | null;
  createdAt: IsoDateTime;
}

export interface AuditLogQuery {
  /** Busca en la acción (`order.`, `void`…). */
  search?: string;
  entity?: string;
  userId?: Uuid;
  from?: IsoDateTime;
  to?: IsoDateTime;
  page?: number;
  pageSize?: number;
}
