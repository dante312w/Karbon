import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/errors/domain-error.js';
import {
  assertOrderEditable,
  assertTicketTransition,
  canTransitionTicket,
  normalizeNotes,
  ticketStatusChange,
} from './order-rules.js';

describe('transiciones de comandas', () => {
  it('cocina lleva la comanda de Nuevo a Listo', () => {
    expect(canTransitionTicket('kitchen', 'NEW', 'PREPARING')).toBe(true);
    expect(canTransitionTicket('kitchen', 'PREPARING', 'READY')).toBe(true);
    expect(canTransitionTicket('kitchen', 'NEW', 'READY')).toBe(true);
  });

  it('cocina ya no entrega ni devuelve entregas; el servicio sí', () => {
    expect(canTransitionTicket('kitchen', 'READY', 'DELIVERED')).toBe(false);
    expect(canTransitionTicket('kitchen', 'DELIVERED', 'READY')).toBe(false);
    expect(canTransitionTicket('service', 'READY', 'DELIVERED')).toBe(true);
    expect(canTransitionTicket('service', 'DELIVERED', 'READY')).toBe(true);
    expect(() => {
      assertTicketTransition('kitchen', 'READY', 'DELIVERED');
    }).toThrow('La entrega en la mesa la confirma el mesero');
  });

  it('el servicio solo entrega lo que está listo', () => {
    expect(canTransitionTicket('service', 'PREPARING', 'DELIVERED')).toBe(false);
    expect(canTransitionTicket('service', 'NEW', 'DELIVERED')).toBe(false);
  });

  it('cada actor deshace su propio paso y nadie cancela desde aquí', () => {
    expect(canTransitionTicket('kitchen', 'READY', 'PREPARING')).toBe(true);
    expect(canTransitionTicket('kitchen', 'PREPARING', 'NEW')).toBe(true);
    expect(canTransitionTicket('kitchen', 'PREPARING', 'CANCELLED')).toBe(false);
    expect(canTransitionTicket('service', 'CANCELLED', 'READY')).toBe(false);
    expect(() => {
      assertTicketTransition('kitchen', 'NEW', 'DELIVERED');
    }).toThrow(DomainError);
  });
});

describe('marcas de tiempo de las comandas', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');

  it('avanzar registra la hora del paso y quién entregó', () => {
    expect(ticketStatusChange('NEW', 'PREPARING', now, null)).toEqual({
      status: 'PREPARING',
      startedAt: now,
    });
    expect(ticketStatusChange('PREPARING', 'READY', now, null)).toEqual({
      status: 'READY',
      readyAt: now,
    });
    expect(ticketStatusChange('READY', 'DELIVERED', now, 'laura')).toEqual({
      status: 'DELIVERED',
      deliveredAt: now,
      deliveredById: 'laura',
    });
  });

  it('retroceder borra la marca del paso deshecho', () => {
    expect(ticketStatusChange('PREPARING', 'NEW', now, null)).toEqual({
      status: 'NEW',
      startedAt: null,
    });
    expect(ticketStatusChange('READY', 'PREPARING', now, null)).toEqual({
      status: 'PREPARING',
      readyAt: null,
    });
    expect(ticketStatusChange('DELIVERED', 'READY', now, 'laura')).toEqual({
      status: 'READY',
      deliveredAt: null,
      deliveredById: null,
    });
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
