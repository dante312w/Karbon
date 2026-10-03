import type { MinorUnits, Percentage, Timestamps, Uuid } from '../common.js';
import type { KitchenStation, TaxKind } from '../enums.js';

export interface TaxDto extends Timestamps {
  id: Uuid;
  name: string;
  kind: TaxKind;
  rate: Percentage;
  isDefault: boolean;
  isActive: boolean;
}

export interface CategoryDto extends Timestamps {
  id: Uuid;
  parentId: Uuid | null;
  name: string;
  description: string | null;
  /** Color hexadecimal para los botones del POS, p. ej. `#22C55E`. */
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Categoría a la que aplica una nota, con el orden de la nota dentro de esa categoría. */
export interface NoteOptionCategoryLink {
  categoryId: Uuid;
  sortOrder: number;
}

/**
 * Nota de un toque que el mesero ofrece al pedir ("Sin cebolla", "Sin hielo"). Una general
 * (`isGeneral`) se ofrece en todos los productos; las demás, en los productos de sus categorías
 * (y subcategorías). Si un producto tiene notas propias (`productIds`), esas reemplazan las de su
 * categoría. Una nota no general sin categorías ni productos no se ofrece en ninguna parte.
 */
export interface NoteOptionDto extends Timestamps {
  id: Uuid;
  label: string;
  isGeneral: boolean;
  /** Orden entre las generales. */
  sortOrder: number;
  isActive: boolean;
  categories: NoteOptionCategoryLink[];
  productIds: Uuid[];
}

export interface ProductDto extends Timestamps {
  id: Uuid;
  categoryId: Uuid;
  taxId: Uuid | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  price: MinorUnits;
  /** Costo teórico según receta, para el cálculo de utilidad. */
  cost: MinorUnits;
  imageUrl: string | null;
  station: KitchenStation;
  sendToKitchen: boolean;
  trackInventory: boolean;
  /** `false` = agotado temporalmente. */
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
}
