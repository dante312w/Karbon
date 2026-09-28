import { Permission, type Uuid } from '@karbon/types';

export interface OrderActor {
  id: Uuid;
  permissions: readonly Permission[];
}

/**
 * Propiedad del pedido: cada mesero opera los suyos; `orders:manage_any` (caja, administración,
 * barra en modo bar) opera los de todos. La misma regla la aplica el backend y la usan las
 * pantallas para no ofrecer acciones que el servidor rechazaría.
 */
export function canManageOrder(actor: OrderActor, waiterId: Uuid): boolean {
  return actor.id === waiterId || actor.permissions.includes(Permission.ORDERS_MANAGE_ANY);
}

/** Confirmar la entrega exige el permiso y, además, ser el dueño del pedido o poder operar todos. */
export function canDeliverOrder(actor: OrderActor, waiterId: Uuid): boolean {
  return actor.permissions.includes(Permission.ORDERS_DELIVER) && canManageOrder(actor, waiterId);
}
