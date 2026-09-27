import { describe, expect, it } from 'vitest';
import { deriveTableStatus } from './table-status.js';

describe('deriveTableStatus', () => {
  it('sin pedidos la mesa queda libre, salvo pagada o reservada (manuales)', () => {
    expect(deriveTableStatus('OCCUPIED', [])).toBe('FREE');
    expect(deriveTableStatus('PAID', [])).toBe('PAID');
    expect(deriveTableStatus('RESERVED', [])).toBe('RESERVED');
  });

  it('pedido abierto sin comandas pendientes = ocupada', () => {
    expect(deriveTableStatus('FREE', [{ status: 'OPEN', tickets: [] }])).toBe('OCCUPIED');
    expect(
      deriveTableStatus('FREE', [{ status: 'OPEN', tickets: [{ status: 'DELIVERED' }] }]),
    ).toBe('OCCUPIED');
  });

  it('comandas nuevas, en preparación o listas = esperando comida', () => {
    for (const status of ['NEW', 'PREPARING', 'READY'] as const) {
      expect(deriveTableStatus('OCCUPIED', [{ status: 'OPEN', tickets: [{ status }] }])).toBe(
        'WAITING_FOOD',
      );
    }
  });

  it('pedir la cuenta tiene prioridad sobre la cocina', () => {
    expect(
      deriveTableStatus('WAITING_FOOD', [
        { status: 'OPEN', tickets: [{ status: 'PREPARING' }] },
        { status: 'BILL_REQUESTED', tickets: [] },
      ]),
    ).toBe('WAITING_BILL');
  });

  it('ignora pedidos pagados o cancelados', () => {
    expect(deriveTableStatus('WAITING_BILL', [{ status: 'PAID', tickets: [] }])).toBe('FREE');
    expect(
      deriveTableStatus('OCCUPIED', [{ status: 'CANCELLED', tickets: [{ status: 'NEW' }] }]),
    ).toBe('FREE');
  });
});
