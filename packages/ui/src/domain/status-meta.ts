import type { KitchenTicketStatus, OrderStatus, OrderType, TableStatus } from '@karbon/types';
import type { Terminology } from '@karbon/utils';

export interface StatusMeta {
  label: string;
  /** Clases de Tailwind para el punto/borde de color del estado. */
  dotClass: string;
  surfaceClass: string;
  /** Color como variable CSS, para dibujos SVG (plano del salón). */
  color: string;
}

/** Presentación única de los estados de mesa para escritorio, PWA y KDS. */
export const TABLE_STATUS_META: Readonly<Record<TableStatus, StatusMeta>> = {
  FREE: {
    label: 'Libre',
    dotClass: 'bg-status-free',
    surfaceClass: 'border-status-free/60 bg-status-free/10',
    color: 'var(--status-free)',
  },
  OCCUPIED: {
    label: 'Ocupada',
    dotClass: 'bg-status-occupied',
    surfaceClass: 'border-status-occupied/60 bg-status-occupied/10',
    color: 'var(--status-occupied)',
  },
  WAITING_FOOD: {
    label: 'Esperando comida',
    dotClass: 'bg-status-waiting-food',
    surfaceClass: 'border-status-waiting-food/60 bg-status-waiting-food/10',
    color: 'var(--status-waiting-food)',
  },
  WAITING_BILL: {
    label: 'Esperando cuenta',
    dotClass: 'bg-status-waiting-bill',
    surfaceClass: 'border-status-waiting-bill/60 bg-status-waiting-bill/10',
    color: 'var(--status-waiting-bill)',
  },
  PAID: {
    label: 'Pagada',
    dotClass: 'bg-status-paid',
    surfaceClass: 'border-status-paid/60 bg-status-paid/10',
    color: 'var(--status-paid)',
  },
  RESERVED: {
    label: 'Reservada',
    dotClass: 'bg-status-reserved',
    surfaceClass: 'border-status-reserved/60 bg-status-reserved/10',
    color: 'var(--status-reserved)',
  },
};

export const KITCHEN_TICKET_STATUS_LABEL: Readonly<Record<KitchenTicketStatus, string>> = {
  NEW: 'Nuevo',
  PREPARING: 'Preparando',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

/** Etiqueta del estado de mesa con el vocabulario del modo (en bar: "Esperando pedido"). */
export function tableStatusLabel(
  status: TableStatus,
  terminology: Pick<Terminology, 'waitingLabel'>,
): string {
  return status === 'WAITING_FOOD' ? terminology.waitingLabel : TABLE_STATUS_META[status].label;
}

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  OPEN: 'Abierto',
  BILL_REQUESTED: 'Cuenta pedida',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

export const ORDER_TYPE_LABEL: Readonly<Record<OrderType, string>> = {
  DINE_IN: 'En el local',
  TAKEAWAY: 'Para llevar',
  DELIVERY: 'Domicilio',
};
