import type { IsoDateTime, MinorUnits, Timestamps, Uuid } from '../common.js';
import type {
  FloorElementKind,
  OrderStatus,
  ReservationStatus,
  TableShape,
  TableStatus,
} from '../enums.js';

/** Resumen de un pedido activo para pintar el mapa de mesas sin cargar el pedido completo. */
export interface TableOrderSummary {
  id: Uuid;
  number: number;
  status: OrderStatus;
  total: MinorUnits;
  guests: number | null;
  waiterId: Uuid;
  waiterName: string;
  /** Comandas aún no entregadas (en cocina o listas). */
  pendingTickets: number;
  /** Comandas listas esperando que el mesero las lleve a la mesa. */
  readyTickets: number;
  /** Envío de la comanda más antigua aún en cocina (Nuevo o Preparando); `null` si no hay. */
  preparingSince: IsoDateTime | null;
  /** Unidades pedidas (sin anuladas). */
  itemCount: number;
  createdAt: IsoDateTime;
}

/** Barra, cocina, baños… en la misma grilla que las mesas. */
export interface FloorElementDto {
  id: Uuid;
  areaId: Uuid;
  kind: FloorElementKind;
  /** Texto propio; null = nombre del tipo. */
  label: string | null;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface AreaDto extends Timestamps {
  id: Uuid;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Elementos fijos del plano del área. */
  elements: FloorElementDto[];
}

export interface TableDto extends Timestamps {
  id: Uuid;
  areaId: Uuid;
  name: string;
  capacity: number;
  status: TableStatus;
  shape: TableShape;
  /** Posición y tamaño en la grilla del mapa de mesas. */
  posX: number;
  posY: number;
  width: number;
  height: number;
  /** Mesa principal cuando esta mesa está unida a otra. */
  mergedIntoId: Uuid | null;
  /** Pedidos activos de la mesa (más de uno si la cuenta se dividió por ítems). */
  activeOrders: TableOrderSummary[];
  isActive: boolean;
}

export interface ReservationDto extends Timestamps {
  id: Uuid;
  tableId: Uuid | null;
  customerId: Uuid | null;
  customerName: string;
  phone: string | null;
  partySize: number;
  reservedFor: IsoDateTime;
  durationMinutes: number;
  status: ReservationStatus;
  notes: string | null;
}
