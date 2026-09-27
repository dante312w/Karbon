import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/errors/domain-error.js';
import {
  assertOrderEditable,
  assertTicketTransition,
  canTransitionTicket,
  normalizeNotes,
  ticketTimestampField,
} from './order-rules.js';

describe('transiciones de comandas', () => {
  it('sigue el flujo Nuevo → Preparando → Listo → Entregado', () => {
    expect(canTransitionTicket('NEW', 'PREPARING')).toBe(true);
    expect(canTransitionTicket('PREPARING', 'READY')).toBe(true);
    expect(canTransitionTicket('READY', 'DELIVERED')).toBe(true);
  });

  it('permite deshacer un paso y saltar a Listo desde Nuevo', () => {
    expect(canTransitionTicket('READY', 'PREPARING')).toBe(true);
    expect(canTransitionTicket('DELIVERED', 'READY')).toBe(true);
    expect(canTransitionTicket('NEW', 'READY')).toBe(true);
  });

  it('rechaza saltos inválidos y la cancelación desde el KDS', () => {
    expect(canTransitionTicket('NEW', 'DELIVERED')).toBe(false);
    expect(canTransitionTicket('PREPARING', 'CANCELLED')).toBe(false);
    expect(canTransitionTicket('CANCELLED', 'NEW')).toBe(false);
    expect(() => {
      assertTicketTransition('NEW', 'DELIVERED');
    }).toThrow(DomainError);
  });

  it('registra la marca de tiempo de cada estado', () => {
    expect(ticketTimestampField('PREPARING')).toBe('startedAt');
    expect(ticketTimestampField('READY')).toBe('readyAt');
    expect(ticketTimestampField('NEW')).toBeNull();
  });
});

describe('reglas del pedido', () => {
  it('solo se editan pedidos abiertos o con cuenta solicitada', () => {
    expect(() => {
      assertOrderEditable('OPEN');
    }).not.toThrow();
    expect(() => {
      assertOrderEditable('BILL_REQUESTED');
    }).not.toThrow();
    expect(() => {
      assertOrderEditable('PAID');
    }).toThrow(DomainError);
  });

  it('normaliza notas vacías', () => {
    expect(normalizeNotes('  sin cebolla ')).toBe('sin cebolla');
    expect(normalizeNotes('   ')).toBeNull();
    expect(normalizeNotes(undefined)).toBeNull();
  });
});
