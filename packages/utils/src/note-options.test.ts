import type { NoteOptionDto } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import {
  hasNote,
  isNoteAssigned,
  ITEM_NOTES_MAX_LENGTH,
  noteSuggestions,
  suggestNoteAssignments,
  toggleNote,
} from './note-options.js';

let sequence = 0;
/** `scope`: `null` = general; lista = categorías (el orden dentro de cada una es el de creación). */
const note = (
  scope: string[] | null,
  label: string,
  overrides: Partial<NoteOptionDto> = {},
): NoteOptionDto => ({
  id: `n${String((sequence += 1))}`,
  label,
  isGeneral: scope === null,
  sortOrder: sequence,
  isActive: true,
  categories: (scope ?? []).map((categoryId) => ({ categoryId, sortOrder: sequence })),
  productIds: [],
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  ...overrides,
});

const categories = [
  { id: 'comidas', parentId: null },
  { id: 'hamburguesas', parentId: 'comidas' },
  { id: 'bebidas', parentId: null },
  { id: 'cocteles', parentId: null },
];

const options = [
  note(null, 'Para llevar'),
  note(['comidas'], 'Sin sal'),
  note(['hamburguesas'], 'Sin cebolla'),
  note(['hamburguesas'], 'Extra queso'),
  note(['hamburguesas'], 'Sin tomate', { isActive: false }),
  note(['hamburguesas'], 'para llevar'),
  note(['bebidas', 'cocteles'], 'Sin hielo'),
];

const product = (categoryId: string, id = `p-${categoryId}`) => ({ id, categoryId });

describe('noteSuggestions', () => {
  it('categoría propia, luego la madre y al final las generales, sin repetir', () => {
    expect(noteSuggestions(options, categories, product('hamburguesas'))).toEqual([
      'Sin cebolla',
      'Extra queso',
      'para llevar',
      'Sin sal',
    ]);
  });

  it('una nota aplica a varias categorías: las de bebidas no aparecen en comidas', () => {
    expect(noteSuggestions(options, categories, product('bebidas'))).toEqual([
      'Sin hielo',
      'Para llevar',
    ]);
    expect(noteSuggestions(options, categories, product('cocteles'))).toEqual([
      'Sin hielo',
      'Para llevar',
    ]);
    expect(noteSuggestions(options, categories, product('comidas'))).not.toContain('Sin hielo');
  });

  it('respeta el orden de cada categoría y omite las inactivas', () => {
    const reordered = options.map((option) =>
      option.label === 'Extra queso'
        ? { ...option, categories: [{ categoryId: 'hamburguesas', sortOrder: -1 }] }
        : option,
    );
    expect(noteSuggestions(reordered, categories, product('hamburguesas')).slice(0, 2)).toEqual([
      'Extra queso',
      'Sin cebolla',
    ]);
  });

  it('las notas propias del producto reemplazan las de su categoría (las generales siguen)', () => {
    const veggie = product('hamburguesas', 'veggie');
    const withOwn = [...options, note([], 'Sin queso vegano', { productIds: ['veggie'] })];
    expect(noteSuggestions(withOwn, categories, veggie)).toEqual([
      'Sin queso vegano',
      'Para llevar',
    ]);
    // Los demás productos de la categoría no cambian.
    expect(noteSuggestions(withOwn, categories, product('hamburguesas'))[0]).toBe('Sin cebolla');
  });

  it('una nota propia inactiva no reemplaza nada', () => {
    const withOwn = [
      ...options,
      note([], 'Sin queso vegano', { productIds: ['veggie'], isActive: false }),
    ];
    expect(noteSuggestions(withOwn, categories, product('hamburguesas', 'veggie'))[0]).toBe(
      'Sin cebolla',
    );
  });

  it('una subcategoría sin notas propias hereda las de su madre y las generales', () => {
    const withChild = [...categories, { id: 'dobles', parentId: 'hamburguesas' }];
    expect(noteSuggestions(options, withChild, product('dobles'))).toEqual([
      'Sin cebolla',
      'Extra queso',
      'para llevar',
      'Sin sal',
    ]);
  });

  it('sin producto solo ofrece las generales; una nota sin asignar no aparece', () => {
    const orphan = note([], 'Huérfana');
    expect(noteSuggestions([...options, orphan], categories, null)).toEqual(['Para llevar']);
    expect(noteSuggestions([orphan], categories, product('bebidas'))).toEqual([]);
    expect(isNoteAssigned(orphan)).toBe(false);
    expect(isNoteAssigned(note(null, 'General'))).toBe(true);
  });

  it('no se cuelga si las categorías forman un ciclo', () => {
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(noteSuggestions([note(['a'], 'Uno'), note(['b'], 'Dos')], loop, product('a'))).toEqual([
      'Uno',
      'Dos',
    ]);
  });
});

describe('suggestNoteAssignments', () => {
  const menu = [
    { id: 'beb', parentId: null, name: 'Bebidas', isActive: true },
    { id: 'jug', parentId: 'beb', name: 'Jugos naturales', isActive: true },
    { id: 'coc', parentId: null, name: 'Cócteles', isActive: true },
    { id: 'car', parentId: null, name: 'Carnes a la parrilla', isActive: true },
    { id: 'ham', parentId: null, name: 'Hamburguesas', isActive: true },
    { id: 'pos', parentId: null, name: 'Postres', isActive: true },
    { id: 'old', parentId: null, name: 'Bebidas viejas', isActive: false },
  ];
  const general = (label: string) => note(null, label);

  it('reparte las generales por familia y deja las comunes como generales', () => {
    const proposals = suggestNoteAssignments(
      [
        general('Sin hielo'),
        general('Término medio'),
        general('Sin cebolla'),
        general('Para llevar'),
        general('Sin helado'),
      ],
      menu,
    );
    const byLabel = new Map(proposals.map((proposal) => [proposal.label, proposal]));
    // Jugos ya hereda de Bebidas; la categoría inactiva no cuenta.
    expect(byLabel.get('Sin hielo')?.categoryIds).toEqual(['beb', 'coc']);
    expect(byLabel.get('Término medio')?.categoryIds).toEqual(['car', 'ham']);
    expect(byLabel.get('Sin cebolla')?.categoryIds).toEqual(['car', 'ham']);
    expect(byLabel.get('Sin helado')?.categoryIds).toEqual(['pos']);
    // Ya es general: no hay nada que proponer.
    expect(byLabel.has('Para llevar')).toBe(false);
  });

  it('"sal" no confunde "salsas" y lo que no encaja queda como está', () => {
    const proposals = suggestNoteAssignments(
      [general('Sin salsas'), general('Con sal'), general('Algo raro')],
      [{ id: 'beb', parentId: null, name: 'Bebidas', isActive: true }],
    );
    expect(proposals).toEqual([]);
  });

  it('no toca notas ya organizadas y propone general una sin asignar de uso común', () => {
    const organized = note(['ham'], 'Sin hielo');
    const orphan = note([], 'Para llevar');
    expect(suggestNoteAssignments([organized, orphan], menu)).toEqual([
      { noteOptionId: orphan.id, label: 'Para llevar', isGeneral: true, categoryIds: [] },
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
