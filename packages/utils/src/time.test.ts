import { describe, expect, it } from 'vitest';
import { elapsedLabel } from './time.js';

describe('elapsedLabel', () => {
  it('muestra minutos y horas', () => {
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(elapsedLabel('2026-09-25T11:55:00Z', now)).toBe('5 min');
    expect(elapsedLabel('2026-09-25T10:40:00Z', now)).toBe('1 h 20 min');
  });

  it('nunca es negativo si el reloj del equipo va atrasado', () => {
    expect(elapsedLabel('2026-09-25T12:05:00Z', Date.parse('2026-09-25T12:00:00Z'))).toBe('0 min');
  });
});
