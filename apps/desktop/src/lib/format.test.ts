import { describe, expect, it } from 'vitest';
import { parseMoney } from './format';

describe('parseMoney', () => {
  it('interpreta montos con separadores de miles colombianos', () => {
    expect(parseMoney('25.000', 'COP')).toBe(2_500_000);
    expect(parseMoney('$ 1.250.000', 'COP')).toBe(125_000_000);
    expect(parseMoney('25000', 'COP')).toBe(2_500_000);
  });

  it('respeta decimales cuando se escriben', () => {
    expect(parseMoney('12,50', 'USD')).toBe(1_250);
    expect(parseMoney('12.5', 'USD')).toBe(1_250);
  });

  it('rechaza textos sin números', () => {
    expect(parseMoney('abc', 'COP')).toBeNull();
    expect(parseMoney('', 'COP')).toBeNull();
  });
});
