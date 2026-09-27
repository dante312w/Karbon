import { describe, expect, it } from 'vitest';
import { formatElapsed, getTicketUrgency } from './kds.js';

const MINUTE = 60_000;

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
