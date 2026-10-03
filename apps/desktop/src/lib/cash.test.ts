import { describe, expect, it } from 'vitest';
import { tenderedSuggestions } from './cash';

describe('tenderedSuggestions', () => {
  it('redondea a billetes colombianos sin repetir el valor exacto', () => {
    // $43.500 → 50.000, 60.000, 100.000
    expect(tenderedSuggestions(4_350_000, 'COP')).toEqual([5_000_000, 6_000_000, 10_000_000]);
  });

  it('omite sugerencias iguales al monto exacto', () => {
    expect(tenderedSuggestions(5_000_000, 'COP')).toEqual([6_000_000, 10_000_000]);
  });

  it('usa billetes genéricos para monedas no configuradas', () => {
    expect(tenderedSuggestions(1_250, 'PEN')).toEqual([1_500, 2_000, 5_000, 10_000]);
  });
});
