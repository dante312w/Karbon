import { Permission } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { canDeliverOrder, canManageOrder } from './order-access.js';

const waiter = { id: 'laura', permissions: [Permission.ORDERS_DELIVER] };
const cashier = {
  id: 'camila',
  permissions: [Permission.ORDERS_DELIVER, Permission.ORDERS_MANAGE_ANY],
};
const kitchen = { id: 'cocina', permissions: [Permission.KITCHEN_UPDATE] };

describe('propiedad del pedido', () => {
  it('cada mesero opera sus pedidos; con manage_any, los de todos', () => {
    expect(canManageOrder(waiter, 'laura')).toBe(true);
    expect(canManageOrder(waiter, 'andres')).toBe(false);
    expect(canManageOrder(cashier, 'andres')).toBe(true);
  });

  it('entregar exige el permiso además de la propiedad', () => {
    expect(canDeliverOrder(waiter, 'laura')).toBe(true);
    expect(canDeliverOrder(waiter, 'andres')).toBe(false);
    expect(canDeliverOrder(cashier, 'andres')).toBe(true);
    expect(canDeliverOrder(kitchen, 'cocina')).toBe(false);
  });
});
