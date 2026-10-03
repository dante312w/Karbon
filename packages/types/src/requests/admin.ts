import type { MinorUnits, Percentage, Uuid } from '../common.js';
import type {
  BusinessMode,
  FiscalDocumentType,
  FloorElementKind,
  KitchenStation,
  PrinterConnection,
  PrinterKind,
  PrinterPurpose,
  ReservationStatus,
  TableShape,
  TaxKind,
} from '../enums.js';
import type { OpeningHoursSlot } from '../entities/settings.js';
import type { Permission } from '../permissions.js';

// ─── Usuarios y roles ────────────────────────────────────────────────────────

export interface CreateUserRequest {
  name: string;
  username: string;
  email?: string | null;
  password: string;
  /** PIN numérico de 4 a 6 dígitos para ingreso rápido. */
  pin?: string | null;
  roleId: Uuid;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string | null;
  /** Solo si se quiere cambiar. */
  password?: string;
  /** `null` elimina el PIN. */
  pin?: string | null;
  roleId?: Uuid;
  isActive?: boolean;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description?: string | null;
  permissions: Permission[];
}

export type UpdateRoleRequest = Partial<Omit<CreateRoleRequest, 'code'>>;

// ─── Configuración ───────────────────────────────────────────────────────────

export interface UpdateSettingsRequest {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string;
  locale?: string;
  timezone?: string;
  pricesIncludeTax?: boolean;
  tipEnabled?: boolean;
  tipPercent?: Percentage;
  maxDiscountPercent?: Percentage;
  openingHours?: OpeningHoursSlot[];
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  kdsWarningMinutes?: number;
  kdsCriticalMinutes?: number;
  staffCallEscalateSeconds?: number;
  businessMode?: BusinessMode;
}

/** Imagen como data URL (`data:image/png;base64,…`), máximo 512 KB. */
export interface UploadImageRequest {
  dataUrl: string;
}

export interface CreateTaxRequest {
  name: string;
  kind: TaxKind;
  rate: Percentage;
  isDefault?: boolean;
}

export type UpdateTaxRequest = Partial<CreateTaxRequest> & { isActive?: boolean };

export interface CreatePrinterRequest {
  name: string;
  kind: PrinterKind;
  connection: PrinterConnection;
  address?: string | null;
  paperWidthMm?: number;
  purposes: PrinterPurpose[];
}

export type UpdatePrinterRequest = Partial<CreatePrinterRequest> & { isActive?: boolean };

export interface CreateNumberingRangeRequest {
  documentType: FiscalDocumentType;
  prefix: string;
  rangeFrom: number;
  rangeTo: number;
  resolutionNumber?: string | null;
  resolutionDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  technicalKey?: string | null;
}

// ─── Salón ───────────────────────────────────────────────────────────────────

export interface CreateAreaRequest {
  name: string;
  sortOrder?: number;
}

export type UpdateAreaRequest = Partial<CreateAreaRequest> & { isActive?: boolean };

export interface CreateTableRequest {
  areaId: Uuid;
  name: string;
  capacity?: number;
  shape?: TableShape;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
}

export type UpdateTableRequest = Partial<CreateTableRequest> & { isActive?: boolean };

export interface CreateFloorElementRequest {
  kind: FloorElementKind;
  label?: string | null;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
}

export type UpdateFloorElementRequest = Partial<CreateFloorElementRequest>;

export interface MergeTablesRequest {
  /** Mesas que se unen a la mesa principal (libres, abiertas sin consumo o con su cuenta). */
  tableIds: Uuid[];
  /**
   * Confirma que, si varias mesas tienen consumo, sus cuentas quedan separadas dentro de la
   * principal. Sin confirmar, el servidor responde TABLE_MERGE_NEEDS_CONFIRMATION.
   */
  separateAccounts?: boolean;
}

/** Separar mesas unidas; sin `tableIds`, todas. */
export interface UnmergeTablesRequest {
  tableIds?: Uuid[];
}

/** Marcado manual de reserva o liberación de una mesa sin pedidos activos. */
export interface SetTableStatusRequest {
  status: 'FREE' | 'RESERVED';
}

export interface CreateReservationRequest {
  tableId?: Uuid | null;
  customerId?: Uuid | null;
  customerName: string;
  phone?: string | null;
  partySize: number;
  reservedFor: string;
  durationMinutes?: number;
  notes?: string | null;
}

export type UpdateReservationRequest = Partial<CreateReservationRequest> & {
  status?: ReservationStatus;
};

// ─── Catálogo ────────────────────────────────────────────────────────────────

export interface CreateCategoryRequest {
  name: string;
  parentId?: Uuid | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest> & { isActive?: boolean };

export interface CreateNoteOptionRequest {
  label: string;
  /** General: se ofrece en todos los productos; entonces no lleva categorías ni productos. */
  isGeneral?: boolean;
  categoryIds?: Uuid[];
  productIds?: Uuid[];
}

/** Las listas reemplazan las asignaciones actuales; omitidas, no cambian. */
export interface UpdateNoteOptionRequest {
  label?: string;
  isActive?: boolean;
  isGeneral?: boolean;
  categoryIds?: Uuid[];
  productIds?: Uuid[];
}

/** Nuevo orden de las notas de una categoría (o de las generales, con `categoryId = null`). */
export interface ReorderNoteOptionsRequest {
  categoryId: Uuid | null;
  ids: Uuid[];
}

/**
 * Asignación masiva desde una categoría o un producto: exactamente estas notas le aplican, en
 * este orden (en un producto el orden lo da la nota). Las generales no se asignan.
 */
export interface SetNoteOptionsRequest {
  noteOptionIds: Uuid[];
}

/** Varias notas a la vez (p. ej. la asignación sugerida por nombre de categoría). */
export interface AssignNoteOptionsRequest {
  assignments: {
    noteOptionId: Uuid;
    isGeneral: boolean;
    categoryIds: Uuid[];
  }[];
}

export interface CreateProductRequest {
  categoryId: Uuid;
  name: string;
  price: MinorUnits;
  taxId?: Uuid | null;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  station?: KitchenStation;
  sendToKitchen?: boolean;
  trackInventory?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
}

export type UpdateProductRequest = Partial<CreateProductRequest> & { isActive?: boolean };

export interface RecipeLineInput {
  ingredientId: Uuid;
  quantity: number;
}

export interface SetRecipeRequest {
  items: RecipeLineInput[];
}
