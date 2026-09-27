import { describe, expect, it } from 'vitest';
import { encodeNameConstraints } from './name-constraints.js';

describe('encodeNameConstraints', () => {
  it('codifica un subárbol DNS y uno IPv4 en DER', () => {
    const der = encodeNameConstraints([['192.168.0.0', '255.255.0.0']], ['local']);
    expect(Buffer.from(der).toString('hex')).toBe(
      // SEQUENCE { [0] { SEQUENCE { [2] "local" }, SEQUENCE { [7] c0a80000 ffff0000 } } }
      '3017' + 'a015' + '3007' + '82056c6f63616c' + '300a' + '8708c0a80000ffff0000',
    );
  });

  it('usa longitud corta con la configuración por defecto', () => {
    const der = encodeNameConstraints();
    expect(der[0]).toBe(0x30);
    expect(der[1]).toBe(der.length - 2);
  });

  it('usa longitud larga (0x81 nn) cuando el contenido supera 127 bytes', () => {
    const names = Array.from({ length: 12 }, (_, index) => `sucursal-${String(index)}.local`);
    const der = encodeNameConstraints([], names);
    expect(der[1]).toBe(0x81);
    expect(der.length).toBe((der[2] ?? 0) + 3);
  });

  it('rechaza direcciones mal escritas', () => {
    expect(() => encodeNameConstraints([['192.168.1', '255.255.0.0']], [])).toThrow(RangeError);
  });
});
