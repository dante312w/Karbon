const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Página de códigos PC858 (Europa occidental + €): la que usan Epson, Xprinter y GOOJPRT. */
const CODE_PAGE_PC858 = 19;

const PC858: Readonly<Record<string, number>> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  É: 0x90,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  Ö: 0x99,
  Ü: 0x9a,
  '£': 0x9c,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  ª: 0xa6,
  º: 0xa7,
  '¿': 0xa8,
  '¡': 0xad,
  Á: 0xb5,
  Â: 0xb6,
  À: 0xb7,
  '€': 0xd5,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  '°': 0xf8,
  '·': 0xfa,
};

export type Alignment = 'left' | 'center' | 'right';

const ALIGN: Readonly<Record<Alignment, number>> = { left: 0, center: 1, right: 2 };

/** Texto a bytes PC858; caracteres sin equivalente se imprimen como "?". */
export function encodePc858(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0x3f;
    if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else if (char === '\n') bytes.push(LF);
    else bytes.push(PC858[char] ?? 0x3f);
  }
  return bytes;
}

/** Ajusta a `width` columnas: izquierda recortada, derecha completa. */
export function twoColumns(left: string, right: string, width: number): string {
  const available = Math.max(0, width - right.length - 1);
  const clipped = left.length > available ? left.slice(0, available) : left;
  return clipped + ' '.repeat(Math.max(1, width - clipped.length - right.length)) + right;
}

/** Parte un texto largo en líneas del ancho del papel, respetando palabras. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!current) current = word.slice(0, width);
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Constructor de comandos ESC/POS (subconjunto soportado por impresoras térmicas comunes). */
export class EscPosBuilder {
  private readonly bytes: number[] = [];

  constructor(readonly columns: number) {
    this.bytes.push(ESC, 0x40, ESC, 0x74, CODE_PAGE_PC858);
  }

  align(alignment: Alignment): this {
    this.bytes.push(ESC, 0x61, ALIGN[alignment]);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Multiplicador de ancho y alto (1–8). */
  size(width: number, height: number): this {
    const clamp = (value: number): number => Math.min(8, Math.max(1, Math.round(value))) - 1;
    this.bytes.push(GS, 0x21, (clamp(width) << 4) | clamp(height));
    return this;
  }

  line(text = ''): this {
    this.bytes.push(...encodePc858(text), LF);
    return this;
  }

  columnsLine(left: string, right: string, columns = this.columns): this {
    return this.line(twoColumns(left, right, columns));
  }

  separator(char = '-'): this {
    return this.line(char.repeat(this.columns));
  }

  feed(lines: number): this {
    this.bytes.push(ESC, 0x64, Math.min(255, Math.max(0, lines)));
    return this;
  }

  /** Código QR (modelo 2, corrección M). */
  qr(data: string, moduleSize = 6): this {
    const payload = encodePc858(data);
    const length = payload.length + 3;
    this.bytes.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00);
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, Math.min(16, Math.max(1, moduleSize)));
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31);
    this.bytes.push(GS, 0x28, 0x6b, length & 0xff, length >> 8, 0x31, 0x50, 0x30, ...payload);
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    return this;
  }

  /** Pulso al cajón monedero conectado a la impresora. */
  openDrawer(): this {
    this.bytes.push(ESC, 0x70, 0, 25, 250);
    return this;
  }

  cut(): this {
    this.bytes.push(GS, 0x56, 0x42, 0x03);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.bytes);
  }
}

/** Columnas de texto según el ancho del papel (fuente A). */
export function columnsForPaper(paperWidthMm: number): number {
  return paperWidthMm <= 58 ? 32 : 48;
}
