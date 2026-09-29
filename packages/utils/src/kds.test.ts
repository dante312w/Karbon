import { describe, expect, it } from 'vitest';
import { formatElapsed, getTicketUrgency, summarizePreparation, ticketTiming } from './kds.js';

const MINUTE = 60_000;
const T0 = Date.parse('2026-09-28T12:00:00.000Z');
const at = (minutes: number): string => new Date(T0 + minutes * MINUTE).toISOString();

describe('ticketTiming', () => {
  const base = { createdAt: at(0), readyAt: null, deliveredAt: null };

  it('mientras está en cocina el cronómetro corre desde el envío', () => {
    const timing = ticketTiming({ ...base, status: 'PREPARING' }, T0 + 8 * MINUTE);
    expect(timing).toEqual({
      kitchenMs: 8 * MINUTE,
      pickupMs: null,
      totalMs: null,
      stopped: false,
    });
  });

  it('lista: congela el tiempo de cocina y mide la espera del mesero', () => {
    const ticket = { ...base, status: 'READY' as const, readyAt: at(9) };
    expect(ticketTiming(ticket, T0 + 12 * MINUTE)).toEqual({
      kitchenMs: 9 * MINUTE,
      pickupMs: 3 * MINUTE,
      totalMs: null,
      stopped: false,
    });
  });

  it('entregada: el total queda fijo aunque pase el tiempo', () => {
    const ticket = { ...base, status: 'DELIVERED' as const, readyAt: at(9), deliveredAt: at(12) };
    const now = ticketTiming(ticket, T0 + 13 * MINUTE);
    const hoursLater = ticketTiming(ticket, T0 + 300 * MINUTE);
    expect(now).toEqual({
      kitchenMs: 9 * MINUTE,
      pickupMs: 3 * MINUTE,
      totalMs: 12 * MINUTE,
      stopped: true,
    });
    expect(hoursLater).toEqual(now);
  });

  it('entregada sin marca de entrega (datos antiguos) no usa la hora actual', () => {
    const ticket = { ...base, status: 'DELIVERED' as const, readyAt: at(9) };
    expect(ticketTiming(ticket, T0 + 500 * MINUTE).totalMs).toBe(9 * MINUTE);
  });

  it('cancelada: detenida', () => {
    expect(ticketTiming({ ...base, status: 'CANCELLED' }, T0 + MINUTE).stopped).toBe(true);
  });
});

describe('summarizePreparation', () => {
  it('cuenta lo listo y toma la comanda más antigua aún en cocina', () => {
    expect(
      summarizePreparation([
        { status: 'READY', createdAt: at(0) },
        { status: 'PREPARING', createdAt: at(5) },
        { status: 'NEW', createdAt: at(2) },
        { status: 'DELIVERED', createdAt: at(-10) },
        { status: 'CANCELLED', createdAt: at(-20) },
      ]),
    ).toEqual({ readyTickets: 1, preparingSince: at(2) });
  });

  it('sin nada en cocina no hay espera', () => {
    expect(summarizePreparation([{ status: 'DELIVERED', createdAt: at(0) }])).toEqual({
      readyTickets: 0,
      preparingSince: null,
    });
  });
});

describe('getTicketUrgency', () => {
  it('usa verde / amarillo / rojo según los umbrales por defecto (10 y 20 min)', () => {
    expect(getTicketUrgency(0)).toBe('normal');
    expect(getTicketUrgency(9 * MINUTE + 59_999)).toBe('normal');
    expect(getTicketUrgency(10 * MINUTE)).toBe('warning');
    expect(getTicketUrgency(20 * MINUTE)).toBe('critical');
  });

  it('respeta umbrales configurados por el restaurante', () => {
    const thresholds = { warningMinutes: 5, criticalMinutes: 8 };
    expect(getTicketUrgency(6 * MINUTE, thresholds)).toBe('warning');
    expect(getTicketUrgency(8 * MINUTE, thresholds)).toBe('critical');
  });

  it('rechaza umbrales incoherentes', () => {
    expect(() => getTicketUrgency(0, { warningMinutes: 10, criticalMinutes: 10 })).toThrow(
      RangeError,
    );
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [65_000, '01:05'],
    [59 * MINUTE + 59_000, '59:59'],
    [62 * MINUTE + 5_000, '1:02:05'],
    [-5_000, '00:00'],
  ])('%i ms → %s', (elapsed, expected) => {
    expect(formatElapsed(elapsed)).toBe(expected);
  });
});
