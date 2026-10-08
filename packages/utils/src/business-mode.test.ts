import { describe, expect, it } from 'vitest';
import { effectiveStation, enabledStations, getTerminology } from './business-mode.js';

describe('modo de negocio', () => {
  it('en restaurante hay cocina y barra, y cada producto conserva su estación', () => {
    expect(enabledStations('RESTAURANT')).toEqual(['KITCHEN', 'BAR']);
    expect(effectiveStation('KITCHEN', 'RESTAURANT')).toBe('KITCHEN');
    expect(effectiveStation('BAR', 'RESTAURANT')).toBe('BAR');
  });

  it('en bar la barra reemplaza a la cocina', () => {
    expect(enabledStations('BAR')).toEqual(['BAR']);
    expect(effectiveStation('KITCHEN', 'BAR')).toBe('BAR');
    expect(effectiveStation('BAR', 'BAR')).toBe('BAR');
  });

  it('cambia el vocabulario del área de preparación', () => {
    expect(getTerminology('RESTAURANT').sendAction).toBe('Enviar a cocina');
    expect(getTerminology('BAR').sendAction).toBe('Enviar a barra');
    expect(getTerminology('BAR').prepArea).toBe('Barra');
  });
});
