import type { CategoryDto, NoteOptionDto, Uuid } from '@karbon/types';

/**
 * Notas de un toque para un producto de `categoryId`: primero las de su categoría, luego las
 * heredadas de las categorías madre y al final las generales. Solo las activas y sin repetir
 * (sin distinguir mayúsculas), en el orden configurado.
 */
export function noteSuggestions(
  options: readonly NoteOptionDto[],
  categories: readonly Pick<CategoryDto, 'id' | 'parentId'>[],
  categoryId: Uuid | null,
): string[] {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const chain: (Uuid | null)[] = [];
  for (
    let current: Uuid | null = categoryId;
    current !== null && !chain.includes(current);
    current = parentOf.get(current) ?? null
  ) {
    chain.push(current);
  }
  chain.push(null);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const level of chain) {
    const labels = options
      .filter((option) => option.isActive && option.categoryId === level)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => option.label);
    for (const label of labels) {
      const key = label.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(label);
    }
  }
  return result;
}

/** Largo máximo de la nota de un producto (el editor de texto usa el mismo límite). */
export const ITEM_NOTES_MAX_LENGTH = 200;

const noteKey = (note: string): string => note.trim().toLowerCase();

function splitNotes(notes: string): string[] {
  return notes
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** ¿La nota ya está en el texto? Sin distinguir mayúsculas ("sin cebolla" = "Sin cebolla"). */
export function hasNote(notes: string, note: string): boolean {
  return splitNotes(notes).some((part) => noteKey(part) === noteKey(note));
}

/**
 * Agrega o quita una nota de un toque del texto libre ("Sin cebolla, bien asada"). Si agregarla
 * pasaría del largo máximo, el texto queda igual.
 */
export function toggleNote(notes: string, note: string): string {
  const parts = splitNotes(notes);
  if (hasNote(notes, note)) {
    return parts.filter((part) => noteKey(part) !== noteKey(note)).join(', ');
  }
  const next = [...parts, note.trim()].join(', ');
  return next.length > ITEM_NOTES_MAX_LENGTH ? notes : next;
}
