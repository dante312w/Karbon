import { FloorElementKind, TableShape } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import {
  blocks,
  CELL,
  chairPositions,
  fitFontSize,
  freePosition,
  overlaps,
  planSize,
  tableRect,
} from './floor-geometry';

const box = (posX: number, posY: number, width = 1, height = 1) => ({ posX, posY, width, height });

describe('plano del salón', () => {
  it('ubica la mesa dentro de su celda dejando margen para las sillas', () => {
    const rect = tableRect(box(2, 1));
    expect(rect.x).toBeGreaterThan(2 * CELL);
    expect(rect.x + rect.width).toBeLessThan(3 * CELL);
    expect(rect.y).toBeGreaterThan(CELL);
  });

  it('dibuja una silla por puesto en todos los tipos de mesa', () => {
    const rect = tableRect(box(0, 0, 2, 1));
    expect(chairPositions(TableShape.ROUND, tableRect(box(0, 0)), 5)).toHaveLength(5);
    expect(chairPositions(TableShape.SQUARE, tableRect(box(0, 0)), 4)).toHaveLength(4);
    expect(chairPositions(TableShape.RECTANGLE, rect, 8)).toHaveLength(8);
    expect(chairPositions(TableShape.RECTANGLE, rect, 3)).toHaveLength(3);
  });

  it('reparte una silla por lado en una mesa cuadrada de cuatro', () => {
    const rect = tableRect(box(0, 0));
    const chairs = chairPositions(TableShape.SQUARE, rect, 4);
    const outside = (point: { x: number; y: number }) =>
      point.y < rect.y ||
      point.y > rect.y + rect.height ||
      point.x < rect.x ||
      point.x > rect.x + rect.width;
    expect(chairs.every(outside)).toBe(true);
    expect(new Set(chairs.map((point) => `${String(point.x)}:${String(point.y)}`)).size).toBe(4);
  });

  it('limita las sillas dibujadas en mesas muy grandes', () => {
    expect(chairPositions(TableShape.RECTANGLE, tableRect(box(0, 0, 4, 1)), 40)).toHaveLength(12);
  });

  it('calcula el tamaño del plano con margen', () => {
    expect(planSize([box(0, 0), box(6, 2)], 0, { cols: 1, rows: 1 })).toEqual({ cols: 7, rows: 3 });
    expect(planSize([box(0, 0)], 2, { cols: 8, rows: 5 })).toEqual({ cols: 8, rows: 5 });
  });

  it('detecta superposiciones y deja pasar las paredes', () => {
    expect(overlaps(box(0, 0, 2, 1), box(1, 0))).toBe(true);
    expect(overlaps(box(0, 0), box(1, 0))).toBe(false);
    expect(blocks(FloorElementKind.WALL)).toBe(false);
    expect(blocks('TABLE')).toBe(true);
  });

  it('ubica lo nuevo en el primer lugar libre, sin encimarlo a mesas ni elementos', () => {
    const bar = box(0, 0, 3, 1);
    const table = box(3, 0, 2, 2);
    expect(freePosition({ width: 1, height: 1 }, [bar, table])).toEqual({ posX: 5, posY: 0 });
    expect(freePosition({ width: 2, height: 1 }, [bar, table], { posX: 6, posY: 3 })).toEqual({
      posX: 6,
      posY: 3,
    });
    expect(freePosition({ width: 9, height: 1 }, [bar])).toEqual({ posX: 0, posY: 1 });
  });

  it('achica la letra de nombres largos sin bajar del mínimo', () => {
    expect(fitFontSize('M1', 60)).toBe(16);
    expect(fitFontSize('Terraza 12', 60)).toBeLessThan(16);
    expect(fitFontSize('Una mesa con un nombre larguísimo', 60)).toBe(10);
  });
});
