import {
  ErrorCode,
  KitchenTicketStatus,
  OrderStatus,
  type KitchenTicketStatus as TicketStatus,
  type OrderStatus as OrderStatusValue,
} from '@karbon/types';
import { conflict } from '../../common/errors/domain-error.js';

/**
 * Transiciones del KDS. Se permite retroceder un paso (toque accidental) y saltar de Nuevo a
 * Listo (bebidas o productos sin preparación). Cocina/barra nunca cancela: eso es del pedido.
 */
const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  NEW: [KitchenTicketStatus.PREPARING, KitchenTicketStatus.READY],
  PREPARING: [KitchenTicketStatus.READY, KitchenTicketStatus.NEW],
  READY: [KitchenTicketStatus.DELIVERED, KitchenTicketStatus.PREPARING],
  DELIVERED: [KitchenTicketStatus.READY],
  CANCELLED: [],
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransitionTicket(from, to)) {
    throw conflict(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Una comanda en ${from} no puede pasar a ${to}`,
    );
  }
}

/** Marca de tiempo que registra cada estado (para tiempos de preparación en reportes). */
export function ticketTimestampField(
  status: TicketStatus,
): 'startedAt' | 'readyAt' | 'deliveredAt' | 'cancelledAt' | null {
  switch (status) {
    case KitchenTicketStatus.PREPARING:
      return 'startedAt';
    case KitchenTicketStatus.READY:
      return 'readyAt';
    case KitchenTicketStatus.DELIVERED:
      return 'deliveredAt';
    case KitchenTicketStatus.CANCELLED:
      return 'cancelledAt';
    case KitchenTicketStatus.NEW:
      return null;
  }
}

export function assertOrderEditable(status: OrderStatusValue): void {
  if (status !== OrderStatus.OPEN && status !== OrderStatus.BILL_REQUESTED) {
    throw conflict(ErrorCode.ORDER_NOT_EDITABLE, 'El pedido ya fue pagado o cancelado');
  }
}

/** Notas vacías equivalen a sin notas: así "Hamburguesa" y "Hamburguesa, ''" se agrupan. */
export function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}
