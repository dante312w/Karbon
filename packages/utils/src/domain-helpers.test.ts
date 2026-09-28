import type { TableOrderSummary } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { isOrderActive, isTicketOpen } from './order-status.js';
import { normalizeSearch } from './search.js';
import { summarizeTable } from './table-summary.js';

function order(overrides: Partial<TableOrderSummary>): TableOrderSummary {
  return {
    id: 'o',
    number: 1,
    status: 'OPEN',
    total: 0,
    guests: null,
    waiterId: 'w',
    waiterName: 'Camila',
    pendingTickets: 0,
    createdAt: '2026-09-25T12:00:00.000Z',
    ...overrides,
  };
}

describe('summarizeTable', () => {
  it('suma las cuentas abiertas y toma la apertura más antigua', () => {
    const summary = summarizeTable({
      activeOrders: [
        order({ total: 5_000_000, guests: 2, pendingTickets: 1 }),
        order({ total: 1_000_000, pendingTickets: 2, createdAt: '2026-09-25T11:30:00.000Z' }),
      ],
    });
    expect(summary).toEqual({
      total: 6_000_000,
      guests: 2,
      pendingTickets: 3,
      openedAt: '2026-09-25T11:30:00.000Z',
    });
  });

  it('una mesa libre no tiene apertura', () => {
    expect(summarizeTable({ activeOrders: [] }).openedAt).toBeNull();
  });
});

describe('estados compartidos', () => {
  it('solo abierto y cuenta pedida son pedidos activos', () => {
    expect(isOrderActive('OPEN')).toBe(true);
    expect(isOrderActive('BILL_REQUESTED')).toBe(true);
    expect(isOrderActive('PAID')).toBe(false);
    expect(isOrderActive('CANCELLED')).toBe(false);
  });

  it('una comanda entregada o cancelada ya no está en cocina', () => {
    expect(isTicketOpen('READY')).toBe(true);
    expect(isTicketOpen('DELIVERED')).toBe(false);
    expect(isTicketOpen('CANCELLED')).toBe(false);
  });
});

describe('normalizeSearch', () => {
  it('ignora mayúsculas, tildes y espacios de los extremos', () => {
    expect(normalizeSearch('  Limonáda ')).toBe('limonada');
    expect(normalizeSearch('ÑOQUIS')).toBe('noquis');
  });
});
