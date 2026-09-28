import {
  ErrorCode,
  KitchenTicketStatus,
  type KitchenTicketStatus as TicketStatus,
  type OrderStatus,
} from '@karbon/types';
import { isOrderActive } from '@karbon/utils';
import { conflict } from '../../common/errors/domain-error.js';

/**
 * Quién mueve la comanda: cocina/barra la prepara (KDS) y el servicio (mesero, o caja) confirma
 * que llegó a la mesa. Cada uno puede deshacer su propio paso ante un toque accidental.
 */
export type TicketActor = 'kitchen' | 'service';

const TICKET_TRANSITIONS: Readonly<
  Record<TicketActor, Readonly<Record<TicketStatus, readonly TicketStatus[]>>>
> = {
  // Nuevo → Listo directo: bebidas o productos sin preparación. Cocina nunca cancela ni entrega.
  kitchen: {
    NEW: [KitchenTicketStatus.PREPARING, KitchenTicketStatus.READY],
    PREPARING: [KitchenTicketStatus.READY, KitchenTicketStatus.NEW],
    READY: [KitchenTicketStatus.PREPARING],
    DELIVERED: [],
    CANCELLED: [],
  },
  service: {
    NEW: [],
    PREPARING: [],
    READY: [KitchenTicketStatus.DELIVERED],
    DELIVERED: [KitchenTicketStatus.READY],
    CANCELLED: [],
  },
};

export function canTransitionTicket(
  actor: TicketActor,
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return TICKET_TRANSITIONS[actor][from].includes(to);
}

export function assertTicketTransition(
  actor: TicketActor,
  from: TicketStatus,
  to: TicketStatus,
): void {
  if (canTransitionTicket(actor, from, to)) return;
  const message =
    actor === 'kitchen' && to === KitchenTicketStatus.DELIVERED
      ? 'La entrega en la mesa la confirma el mesero'
      : `Una comanda en ${from} no puede pasar a ${to}`;
  throw conflict(ErrorCode.INVALID_STATUS_TRANSITION, message);
}

export interface TicketStatusChange {
  status: TicketStatus;
  startedAt?: Date | null;
  readyAt?: Date | null;
  deliveredAt?: Date | null;
  deliveredById?: string | null;
  cancelledAt?: Date | null;
}

/**
 * Datos que registra una transición. Avanzar marca la hora del paso; retroceder borra la marca
 * del paso deshecho, así los cronómetros y los reportes de tiempos nunca quedan incoherentes.
 */
export function ticketStatusChange(
  from: TicketStatus,
  to: TicketStatus,
  now: Date,
  actorId: string | null,
): TicketStatusChange {
  switch (to) {
    case KitchenTicketStatus.NEW:
      return { status: to, startedAt: null };
    case KitchenTicketStatus.PREPARING:
      return from === KitchenTicketStatus.READY
        ? { status: to, readyAt: null }
        : { status: to, startedAt: now };
    case KitchenTicketStatus.READY:
      return from === KitchenTicketStatus.DELIVERED
        ? { status: to, deliveredAt: null, deliveredById: null }
        : { status: to, readyAt: now };
    case KitchenTicketStatus.DELIVERED:
      return { status: to, deliveredAt: now, deliveredById: actorId };
    case KitchenTicketStatus.CANCELLED:
      return { status: to, cancelledAt: now };
  }
}

export function assertOrderEditable(status: OrderStatus): void {
  if (!isOrderActive(status)) {
    throw conflict(ErrorCode.ORDER_NOT_EDITABLE, 'El pedido ya fue pagado o cancelado');
  }
}

/** Notas vacías equivalen a sin notas: así "Hamburguesa" y "Hamburguesa, ''" se agrupan. */
export function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}
