import type { NoteOptionDto } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { hasNote, ITEM_NOTES_MAX_LENGTH, noteSuggestions, toggleNote } from './note-options.js';

let sequence = 0;
const note = (
  categoryId: string | null,
  label: string,
  overrides: Partial<NoteOptionDto> = {},
): NoteOptionDto => ({
  id: `n${String((sequence += 1))}`,
  categoryId,
  label,
  sortOrder: sequence,
  isActive: true,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  ...overrides,
});

const categories = [
  { id: 'comidas', parentId: null },
  { id: 'hamburguesas', parentId: 'comidas' },
  { id: 'bebidas', parentId: null },
];

const options = [
  note(null, 'Para llevar'),
  note('comidas', 'Sin sal'),
  note('hamburguesas', 'Sin cebolla'),
  note('hamburguesas', 'Extra queso'),
  note('hamburguesas', 'Sin tomate', { isActive: false }),
  note('hamburguesas', 'para llevar'),
  note('bebidas', 'Sin hielo'),
];

describe('noteSuggestions', () => {
  it('categoría propia, luego la madre y al final las generales, sin repetir', () => {
    expect(noteSuggestions(options, categories, 'hamburguesas')).toEqual([
      'Sin cebolla',
      'Extra queso',
      'para llevar',
      'Sin sal',
    ]);
  });

  it('cada categoría ve sus notas: las de bebidas no aparecen en comidas', () => {
    expect(noteSuggestions(options, categories, 'bebidas')).toEqual(['Sin hielo', 'Para llevar']);
  });

  it('respeta el orden configurado y omite las inactivas', () => {
    const reordered = options.map((option) =>
      option.label === 'Extra queso' ? { ...option, sortOrder: -1 } : option,
    );
    expect(noteSuggestions(reordered, categories, 'hamburguesas').slice(0, 2)).toEqual([
      'Extra queso',
      'Sin cebolla',
    ]);
  });

  it('una categoría sin notas propias hereda las de su madre y las generales', () => {
    const withChild = [...categories, { id: 'dobles', parentId: 'hamburguesas' }];
    expect(noteSuggestions(options, withChild, 'dobles')).toEqual([
      'Sin cebolla',
      'Extra queso',
      'para llevar',
      'Sin sal',
    ]);
  });

  it('sin categoría solo ofrece las generales', () => {
    expect(noteSuggestions(options, categories, null)).toEqual(['Para llevar']);
  });

  it('no se cuelga si las categorías forman un ciclo', () => {
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(noteSuggestions([note('a', 'Uno'), note('b', 'Dos')], loop, 'a')).toEqual([
      'Uno',
      'Dos',
    ]);
  });
});

describe('toggleNote', () => {
  it('agrega al final respetando el texto libre', () => {
    expect(toggleNote('', 'Sin cebolla')).toBe('Sin cebolla');
    expect(toggleNote('bien asada', 'Sin cebolla')).toBe('bien asada, Sin cebolla');
  });

  it('quita la nota sin distinguir mayúsculas y limpia las comas', () => {
    expect(toggleNote('sin cebolla ,  bien asada,', 'Sin cebolla')).toBe('bien asada');
    expect(hasNote('SIN HIELO, doble', 'Sin hielo')).toBe(true);
    expect(hasNote('sin hielos', 'Sin hielo')).toBe(false);
  });

  it('no pasa del largo máximo', () => {
    const long = 'x'.repeat(ITEM_NOTES_MAX_LENGTH - 5);
    expect(toggleNote(long, 'Sin cebolla')).toBe(long);
  });
});
