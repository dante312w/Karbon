import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('usa punto y coma, BOM y escapa comillas y separadores', () => {
    const csv = toCsv(
      ['Producto', 'Total'],
      [
        ['Café "especial"', 5000],
        ['Pan; queso', null],
      ],
    );
    expect(csv).toBe(
      String.fromCharCode(0xfeff) + 'Producto;Total\r\n"Café ""especial""";5000\r\n"Pan; queso";',
    );
  });
});
