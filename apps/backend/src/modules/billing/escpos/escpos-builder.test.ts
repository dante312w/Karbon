import { describe, expect, it } from 'vitest';
import { columnsForPaper, encodePc858, EscPosBuilder, twoColumns, wrap } from './escpos-builder.js';

describe('ESC/POS', () => {
  it('codifica acentos, ñ y signos del español en PC858', () => {
    expect(encodePc858('Añejo')).toEqual([0x41, 0xa4, 0x65, 0x6a, 0x6f]);
    expect(encodePc858('¿Café?')).toEqual([0xa8, 0x43, 0x61, 0x66, 0x82, 0x3f]);
    expect(encodePc858('Ñ€')).toEqual([0xa5, 0xd5]);
    expect(encodePc858('漢')).toEqual([0x3f]);
  });

  it('inicializa la impresora y selecciona la página de códigos', () => {
    const bytes = [...new EscPosBuilder(48).build()];
    expect(bytes).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
  });

  it('arma líneas a dos columnas del ancho exacto del papel', () => {
    expect(twoColumns('Total', '$ 25.000', 20)).toBe(`Total${' '.repeat(7)}$ 25.000`);
    expect(twoColumns('Hamburguesa doble tocineta', '$ 32.000', 20)).toHaveLength(20);
    expect(columnsForPaper(58)).toBe(32);
    expect(columnsForPaper(80)).toBe(48);
  });

  it('parte textos largos respetando palabras', () => {
    expect(wrap('Gracias por su visita, vuelva pronto', 16)).toEqual([
      'Gracias por su',
      'visita, vuelva',
      'pronto',
    ]);
  });

  it('incluye corte de papel, tamaño y apertura de cajón', () => {
    const bytes = [...new EscPosBuilder(32).size(2, 2).openDrawer().cut().build()];
    expect(bytes.slice(5)).toEqual([
      0x1d, 0x21, 0x11, 0x1b, 0x70, 0, 25, 250, 0x1d, 0x56, 0x42, 0x03,
    ]);
  });
});
