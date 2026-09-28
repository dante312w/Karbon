import { FloorElementKind, TableShape } from '@karbon/types';

/** Lado de una celda de la grilla en unidades del SVG (el plano escala al ancho disponible). */
export const CELL = 96;
/** Margen entre el borde de la celda y la mesa: ahí se dibujan las sillas. */
const TABLE_INSET = 18;
/** Distancia del borde de la mesa al centro de cada silla. */
const CHAIR_OFFSET = 10;
/** Más sillas no caben con claridad; la capacidad exacta se ve en el panel de la mesa. */
const MAX_CHAIRS = 12;
/** Ancho mínimo (en celdas) donde se buscan lugares libres para ubicar algo nuevo. */
const PLACEMENT_COLUMNS = 8;

export interface GridBox {
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

export function cellRect(box: GridBox, inset = 0): Rect {
  return {
    x: box.posX * CELL + inset,
    y: box.posY * CELL + inset,
    width: box.width * CELL - inset * 2,
    height: box.height * CELL - inset * 2,
  };
}

export function tableRect(box: GridBox): Rect {
  return cellRect(box, TABLE_INSET);
}

/** Columnas y filas del plano: lo ocupado más un margen (mayor al editar, para tener dónde soltar). */
export function planSize(
  boxes: readonly GridBox[],
  margin: number,
  minimum: { cols: number; rows: number },
): { cols: number; rows: number } {
  let cols = 0;
  let rows = 0;
  for (const box of boxes) {
    cols = Math.max(cols, box.posX + box.width);
    rows = Math.max(rows, box.posY + box.height);
  }
  return {
    cols: Math.max(minimum.cols, cols + margin),
    rows: Math.max(minimum.rows, rows + margin),
  };
}

/** Tamaño del plano de un área: al editar deja dos celdas libres para soltar y un mínimo cómodo. */
export function floorPlanSize(
  boxes: readonly GridBox[],
  editing: boolean,
): { cols: number; rows: number } {
  return editing
    ? planSize(boxes, 2, { cols: 8, rows: 5 })
    : planSize(boxes, 0, { cols: 1, rows: 1 });
}

export function overlaps(a: GridBox, b: GridBox): boolean {
  return (
    a.posX < b.posX + b.width &&
    b.posX < a.posX + a.width &&
    a.posY < b.posY + b.height &&
    b.posY < a.posY + a.height
  );
}

/** Las paredes y barandas pueden bordear otros elementos; el resto no se superpone. */
export function blocks(kind: FloorElementKind | 'TABLE'): boolean {
  return kind !== FloorElementKind.WALL;
}

type Position = Pick<GridBox, 'posX' | 'posY'>;

/**
 * Posición donde cabe un ítem de `size` sin tocar `occupied`: la preferida si está libre; si no,
 * la primera libre recorriendo el plano fila por fila.
 */
export function freePosition(
  size: Pick<GridBox, 'width' | 'height'>,
  occupied: readonly GridBox[],
  preferred: Position = { posX: 0, posY: 0 },
): Position {
  const fits = (posX: number, posY: number): boolean =>
    !occupied.some((other) => overlaps({ ...size, posX, posY }, other));
  if (fits(preferred.posX, preferred.posY)) return preferred;
  const cols = Math.max(
    PLACEMENT_COLUMNS,
    size.width,
    planSize(occupied, 0, { cols: 0, rows: 0 }).cols,
  );
  for (let posY = 0; ; posY += 1) {
    for (let posX = 0; posX + size.width <= cols; posX += 1) {
      if (fits(posX, posY)) return { posX, posY };
    }
  }
}

function spread(count: number, start: number, length: number): number[] {
  return Array.from({ length: count }, (_, index) => start + (length * (index + 1)) / (count + 1));
}

/**
 * Sillas alrededor de la mesa según su capacidad: en círculo para las redondas, una por lado
 * (en rotación) para las cuadradas y sobre los lados largos para las rectangulares, con una en
 * cada cabecera desde seis puestos.
 */
export function chairPositions(shape: TableShape, rect: Rect, capacity: number): Point[] {
  const count = Math.max(0, Math.min(MAX_CHAIRS, capacity));
  const { x, y, width, height } = rect;
  const top = y - CHAIR_OFFSET;
  const bottom = y + height + CHAIR_OFFSET;
  const left = x - CHAIR_OFFSET;
  const right = x + width + CHAIR_OFFSET;

  if (shape === TableShape.ROUND) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
      return {
        x: cx + Math.cos(angle) * (width / 2 + CHAIR_OFFSET),
        y: cy + Math.sin(angle) * (height / 2 + CHAIR_OFFSET),
      };
    });
  }

  if (shape === TableShape.SQUARE && width === height) {
    // Arriba, abajo, izquierda, derecha, arriba… repartidas en cada lado.
    const perSide = [0, 1, 2, 3].map((side) => Math.floor(count / 4) + (side < count % 4 ? 1 : 0));
    return [
      ...spread(perSide[0] ?? 0, x, width).map((px) => ({ x: px, y: top })),
      ...spread(perSide[1] ?? 0, x, width).map((px) => ({ x: px, y: bottom })),
      ...spread(perSide[2] ?? 0, y, height).map((py) => ({ x: left, y: py })),
      ...spread(perSide[3] ?? 0, y, height).map((py) => ({ x: right, y: py })),
    ];
  }

  const horizontal = width >= height;
  const ends = count >= 6 ? 2 : 0;
  const sideA = Math.ceil((count - ends) / 2);
  const sideB = count - ends - sideA;
  const chairs = horizontal
    ? [
        ...spread(sideA, x, width).map((px) => ({ x: px, y: top })),
        ...spread(sideB, x, width).map((px) => ({ x: px, y: bottom })),
      ]
    : [
        ...spread(sideA, y, height).map((py) => ({ x: left, y: py })),
        ...spread(sideB, y, height).map((py) => ({ x: right, y: py })),
      ];
  if (ends === 2) {
    chairs.push(
      horizontal ? { x: left, y: y + height / 2 } : { x: x + width / 2, y: top },
      horizontal ? { x: right, y: y + height / 2 } : { x: x + width / 2, y: bottom },
    );
  }
  return chairs;
}

/** Tamaño de letra para que el nombre quepa en la mesa (en unidades del SVG). */
export function fitFontSize(text: string, width: number, max = 16, min = 10): number {
  const fitted = (width - 10) / (Math.max(1, text.length) * 0.6);
  return Math.round(Math.max(min, Math.min(max, fitted)));
}
