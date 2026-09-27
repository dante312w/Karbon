import { OrderStatus } from '@karbon/types';

/** Pedidos que ocupan una mesa. */
export const ACTIVE_ORDER_STATUSES = [OrderStatus.OPEN, OrderStatus.BILL_REQUESTED] as const;
