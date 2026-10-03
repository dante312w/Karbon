import type { CategoryDto, NoteOptionDto, ProductDto, Uuid } from '@karbon/types';
import { normalizeSearch } from './search.js';

type CategoryTree = readonly Pick<CategoryDto, 'id' | 'parentId'>[];

/** La categoría y sus madres, de la más cercana a la raíz (sin colgarse si hay un ciclo). */
function categoryChain(categories: CategoryTree, categoryId: Uuid | null): Uuid[] {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const chain: Uuid[] = [];
  for (
    let current: Uuid | null = categoryId;
    current !== null && !chain.includes(current);
    current = parentOf.get(current) ?? null
  ) {
    chain.push(current);
  }
  return chain;
}

/** Orden de la nota dentro de la categoría, o `null` si no le aplica. */
function orderIn(option: NoteOptionDto, categoryId: Uuid): number | null {
  return option.categories.find((link) => link.categoryId === categoryId)?.sortOrder ?? null;
}

/**
 * Notas de un toque para un producto: si el producto tiene notas propias, esas; si no, las de su
 * categoría y luego las heredadas de sus categorías madre. Al final siempre las generales. Solo
 * las activas y sin repetir (sin distinguir mayúsculas), en el orden configurado. Sin producto
 * (o sin categoría) solo se ofrecen las generales.
 */
export function noteSuggestions(
  options: readonly NoteOptionDto[],
  categories: CategoryTree,
  product: Pick<ProductDto, 'id' | 'categoryId'> | null,
): string[] {
  const active = options.filter((option) => option.isActive);
  const groups: NoteOptionDto[][] = [];
  const own = product
    ? active
        .filter((option) => !option.isGeneral && option.productIds.includes(product.id))
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  if (own.length > 0) {
    groups.push(own);
  } else {
    for (const level of categoryChain(categories, product?.categoryId ?? null)) {
      groups.push(
        active
          .filter((option) => !option.isGeneral && orderIn(option, level) !== null)
          .sort((a, b) => (orderIn(a, level) ?? 0) - (orderIn(b, level) ?? 0)),
      );
    }
  }
  groups.push(
    active.filter((option) => option.isGeneral).sort((a, b) => a.sortOrder - b.sortOrder),
  );

  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of groups.flat()) {
    const key = option.label.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(option.label);
  }
  return result;
}

/** ¿La nota se ofrece en algún producto? (una no general sin asignaciones no aparece nunca). */
export function isNoteAssigned(
  option: Pick<NoteOptionDto, 'isGeneral' | 'categories' | 'productIds'>,
): boolean {
  return option.isGeneral || option.categories.length > 0 || option.productIds.length > 0;
}

// ─── Asignación sugerida ─────────────────────────────────────────────────────

/**
 * Familias de productos: qué nombres de categoría las identifican y qué notas suelen aplicarles.
 * Una palabra de 5 letras o más coincide como prefijo ("bebida" → "Bebidas calientes"); las más
 * cortas, solo completas ("sal" no es "salsas").
 */
const NOTE_FAMILIES: readonly { categoryWords: readonly string[]; noteWords: readonly string[] }[] =
  [
    {
      // Bebidas, cafés, cocteles y licores.
      categoryWords: [
        'bebida',
        'jugos',
        'jugo',
        'gaseosa',
        'refresco',
        'limonada',
        'cafe',
        'cafes',
        'aromatica',
        'infusion',
        'coctel',
        'cocteles',
        'cocktail',
        'licor',
        'licores',
        'cerveza',
        'vinos',
        'vino',
        'trago',
        'tragos',
        'batido',
        'malteada',
        'smoothie',
        'agua',
        'sodas',
        'soda',
        'michelada',
        'aguardiente',
        'whisky',
        'tequila',
        'vodka',
        'ginebra',
        'ron',
      ],
      noteWords: [
        'hielo',
        'azucar',
        'endulzante',
        'fria',
        'frio',
        'limon',
        'michelada',
        'dulce',
        'vaso',
        'leche',
        'espuma',
        'pitillo',
        'gas',
      ],
    },
    {
      // Platos con término de cocción.
      categoryWords: [
        'carne',
        'carnes',
        'parrilla',
        'asado',
        'asados',
        'res',
        'cerdo',
        'costilla',
        'churrasco',
        'bistec',
        'steak',
        'hamburguesa',
        'fuerte',
        'fuertes',
      ],
      noteWords: ['termino', 'asado', 'asada', 'cocido', 'cocida', 'jugoso', 'jugosa'],
    },
    {
      // Comidas en general.
      categoryWords: [
        'hamburguesa',
        'sandwich',
        'sanduche',
        'perro',
        'perros',
        'pizza',
        'entrada',
        'entradas',
        'plato',
        'platos',
        'almuerzo',
        'comida',
        'comidas',
        'picada',
        'picadas',
        'aperitivo',
        'ensalada',
        'sopas',
        'sopa',
        'pasta',
        'pastas',
        'tacos',
        'burrito',
        'empanada',
        'carne',
        'carnes',
        'pollo',
        'pescado',
        'mariscos',
        'fuerte',
        'fuertes',
        'parrilla',
        'wraps',
        'wrap',
        'desayuno',
        'arepa',
        'arepas',
        'snack',
        'snacks',
        'acompanamiento',
      ],
      noteWords: [
        'cebolla',
        'sal',
        'salsa',
        'queso',
        'tomate',
        'picante',
        'arroz',
        'papas',
        'papa',
        'lechuga',
        'aguacate',
        'tocineta',
        'crocante',
        'ensalada',
        'pan',
        'mayonesa',
        'ketchup',
        'mostaza',
        'aji',
        'pepinillo',
        'champinon',
        'maiz',
      ],
    },
    {
      categoryWords: ['postre', 'helado', 'helados', 'torta', 'tortas', 'pastel', 'reposteria'],
      noteWords: ['helado', 'crema', 'arequipe', 'chocolate', 'canela', 'fruta'],
    },
  ];

/** Notas que tienen sentido en cualquier producto: se proponen como generales. */
const GENERAL_NOTE_WORDS: readonly string[] = ['llevar', 'empacar', 'domicilio', 'compartir'];

function words(text: string): string[] {
  return normalizeSearch(text)
    .split(/[^a-z0-9ñ]+/u)
    .filter(Boolean);
}

function matches(text: string, keywords: readonly string[]): boolean {
  const tokens = words(text);
  return keywords.some((keyword) =>
    tokens.some((token) => (keyword.length >= 5 ? token.startsWith(keyword) : token === keyword)),
  );
}

export interface NoteAssignmentProposal {
  noteOptionId: Uuid;
  label: string;
  isGeneral: boolean;
  categoryIds: Uuid[];
}

/**
 * Propone a qué categorías asignar las notas que aún no están organizadas (generales o sin
 * asignar), por el nombre de la categoría y el texto de la nota: "Sin hielo" a Bebidas,
 * "Término medio" a Carnes. Las que ya tienen categorías o productos no se tocan, y las que no
 * encajan en ninguna familia quedan como están. Solo propone: el administrador revisa y aplica.
 */
export function suggestNoteAssignments(
  options: readonly NoteOptionDto[],
  categories: readonly Pick<CategoryDto, 'id' | 'parentId' | 'name' | 'isActive'>[],
): NoteAssignmentProposal[] {
  const active = categories.filter((category) => category.isActive);
  const proposals: NoteAssignmentProposal[] = [];
  for (const option of options) {
    if (option.categories.length > 0 || option.productIds.length > 0) continue;
    if (matches(option.label, GENERAL_NOTE_WORDS)) {
      if (!option.isGeneral) {
        proposals.push({
          noteOptionId: option.id,
          label: option.label,
          isGeneral: true,
          categoryIds: [],
        });
      }
      continue;
    }
    const families = NOTE_FAMILIES.filter((family) => matches(option.label, family.noteWords));
    const matched = new Set(
      active
        .filter((category) =>
          families.some((family) => matches(category.name, family.categoryWords)),
        )
        .map((category) => category.id),
    );
    // Una subcategoría ya hereda las notas de su madre: asignarla también sobra.
    const categoryIds = [...matched].filter(
      (id) =>
        !categoryChain(categories, id)
          .slice(1)
          .some((ancestor) => matched.has(ancestor)),
    );
    if (categoryIds.length === 0) continue;
    proposals.push({ noteOptionId: option.id, label: option.label, isGeneral: false, categoryIds });
  }
  return proposals;
}

// ─── Texto de la nota del producto ───────────────────────────────────────────

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
