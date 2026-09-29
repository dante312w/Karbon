import type { IsoDateTime, Quantity, Uuid } from './common.js';
import type { MeasureUnit } from './enums.js';
import type { CashSessionDto } from './entities/cash.js';
import type { RestaurantSettingsDto } from './entities/settings.js';
import type { TableDto } from './entities/floor.js';
import type { KitchenTicketDto, OrderDto } from './entities/orders.js';
import type { StaffCallDto } from './entities/staff-calls.js';

/** Nombres de eventos Socket.io emitidos por el servidor. */
export const SocketEvent = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  KITCHEN_READY: 'kitchen.ready',
  /** El mesero confirmó que la comanda llegó a la mesa (o se devolvió a "Listo"). */
  KITCHEN_DELIVERED: 'kitchen.delivered',
  TABLE_CHANGED: 'table.changed',
  INVENTORY_UPDATED: 'inventory.updated',
  CASH_CLOSED: 'cash.closed',
  /** Cambió la configuración (p. ej. modo restaurante ↔ bar): todas las terminales recargan. */
  SETTINGS_UPDATED: 'settings.updated',
  /** Llamado interno nuevo (al mesero o a caja). */
  STAFF_CALL_CREATED: 'staff_call.created',
  /** Alguien insistió, respondió ("Voy"), lo atendió o lo canceló. */
  STAFF_CALL_UPDATED: 'staff_call.updated',
} as const;
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Salas a las que el servidor une cada socket según los permisos del usuario autenticado.
 * Los clientes no eligen sala: así un mesero nunca recibe eventos de caja.
 */
export const SocketRoom = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
  WAITERS: 'waiters',
  KITCHEN: 'kitchen',
} as const;
export type SocketRoom = (typeof SocketRoom)[keyof typeof SocketRoom];

export function userRoom(userId: Uuid): `user:${Uuid}` {
  return `user:${userId}`;
}

/**
 * Sobre común de todos los eventos. `id` permite a los clientes descartar duplicados
 * al reconectarse y `occurredAt` ordenar eventos recibidos fuera de orden.
 */
export interface EventEnvelope<T> {
  id: Uuid;
  occurredAt: IsoDateTime;
  data: T;
}

export interface OrderEventData {
  order: OrderDto;
}

/** Cambio de una comanda que le interesa al mesero del pedido (lista, entregada). */
export interface KitchenTicketEventData {
  ticket: KitchenTicketDto;
  waiterId: Uuid;
}

export interface TableChangedData {
  table: TableDto;
}

export interface LowStockAlert {
  ingredientId: Uuid;
  name: string;
  stock: Quantity;
  minStock: Quantity;
  unit: MeasureUnit;
}

export interface InventoryUpdatedData {
  ingredientIds: Uuid[];
  lowStock: LowStockAlert[];
}

export interface CashClosedData {
  session: CashSessionDto;
}

export interface SettingsUpdatedData {
  settings: RestaurantSettingsDto;
}

export interface StaffCallEventData {
  call: StaffCallDto;
  /** `true` si quien lo recibe debe sonar (llamado nuevo o insistencia), no en respuestas. */
  alert: boolean;
}

export interface SocketEventMap {
  [SocketEvent.ORDER_CREATED]: OrderEventData;
  [SocketEvent.ORDER_UPDATED]: OrderEventData;
  [SocketEvent.KITCHEN_READY]: KitchenTicketEventData;
  [SocketEvent.KITCHEN_DELIVERED]: KitchenTicketEventData;
  [SocketEvent.TABLE_CHANGED]: TableChangedData;
  [SocketEvent.INVENTORY_UPDATED]: InventoryUpdatedData;
  [SocketEvent.CASH_CLOSED]: CashClosedData;
  [SocketEvent.SETTINGS_UPDATED]: SettingsUpdatedData;
  [SocketEvent.STAFF_CALL_CREATED]: StaffCallEventData;
  [SocketEvent.STAFF_CALL_UPDATED]: StaffCallEventData;
}

/** Tipado para `Server`/`Socket` de socket.io en backend y clientes. */
export type ServerToClientEvents = {
  [E in SocketEvent]: (envelope: EventEnvelope<SocketEventMap[E]>) => void;
};

/**
 * Las mutaciones viajan por REST (validadas, auditables e idempotentes); el socket solo notifica,
 * por eso ningún evento cliente → servidor es emitible.
 */
export type ClientToServerEvents = Record<string, never>;
