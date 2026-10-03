import { Permission, type TableDto, type TableOrderSummary } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { canManageAll } from './order-access.js';
import { freeTables, mergeCandidates, mergedChildren } from './table-ops.js';

const summary = (waiterId: string): TableOrderSummary => ({
  id: `o-${waiterId}`,
  number: 1,
  status: 'OPEN',
  total: 0,
  guests: null,
  waiterId,
  waiterName: waiterId,
  pendingTickets: 0,
  readyTickets: 0,
  preparingSince: null,
  itemCount: 0,
  createdAt: '2026-09-28T12:00:00.000Z',
});

const table = (id: string, overrides: Partial<TableDto> = {}): TableDto => ({
  id,
  areaId: 'salon',
  name: id,
  capacity: 4,
  status: 'FREE',
  shape: 'SQUARE',
  posX: 0,
  posY: 0,
  width: 1,
  height: 1,
  mergedIntoId: null,
  activeOrders: [],
  isActive: true,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  ...overrides,
});

const laura = { id: 'laura', permissions: [Permission.TABLES_OPERATE] };
const cashier = { id: 'camila', permissions: [Permission.ORDERS_MANAGE_ANY] };

const main = table('m1', { activeOrders: [summary('laura')] });
const tables = [
  main,
  table('m2'),
  table('m3', { activeOrders: [summary('laura')] }),
  table('m4', { activeOrders: [summary('andres')] }),
  table('m5', { mergedIntoId: 'm1' }),
  table('t1', { areaId: 'terraza' }),
  table('m6', { isActive: false }),
];

describe('operaciones de mesa', () => {
  it('una mesa sin cuentas la opera cualquiera; con cuentas, solo sus dueños o caja', () => {
    expect(canManageAll(laura, [])).toBe(true);
    expect(canManageAll(laura, ['laura', 'laura'])).toBe(true);
    expect(canManageAll(laura, ['laura', 'andres'])).toBe(false);
    expect(canManageAll(cashier, ['laura', 'andres'])).toBe(true);
  });

  it('se unen mesas de la misma área, libres o con cuentas propias', () => {
    expect(mergeCandidates(main, tables, laura).map((t) => t.id)).toEqual(['m2', 'm3']);
    expect(mergeCandidates(main, tables, cashier).map((t) => t.id)).toEqual(['m2', 'm3', 'm4']);
  });

  it('solo se mueve a mesas libres, activas y sin unir', () => {
    expect(freeTables(tables, 'm2').map((t) => t.id)).toEqual(['t1']);
  });

  it('reconoce las mesas unidas a la principal', () => {
    expect(mergedChildren(main, tables).map((t) => t.id)).toEqual(['m5']);
  });
});
