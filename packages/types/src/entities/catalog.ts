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
