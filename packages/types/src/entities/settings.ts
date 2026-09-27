import type { IsoDate, IsoDateTime, MinorUnits, Percentage, Timestamps, Uuid } from '../common.js';
import type {
  BusinessMode,
  FiscalDocumentType,
  InvoiceStatus,
  PrinterConnection,
  PrinterKind,
  PrinterPurpose,
} from '../enums.js';

/** 0 = domingo … 6 = sábado. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Franja de atención en hora local del restaurante (`HH:mm`). Puede cruzar medianoche.
 * Es un alias de tipo y no una interfaz para que sea asignable a columnas JSON de Prisma.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type OpeningHoursSlot = {
  day: DayOfWeek;
  opensAt: string;
  closesAt: string;
};

export interface RestaurantSettingsDto {
  /** Identidad de esta instalación; clave para la futura sincronización multi-sucursal. */
  branchId: Uuid;
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  /** Código ISO 4217, p. ej. `COP`. */
  currency: string;
  /** Etiqueta BCP 47, p. ej. `es-CO`. */
  locale: string;
  /** Zona IANA, p. ej. `America/Bogota`. */
  timezone: string;
  pricesIncludeTax: boolean;
  tipEnabled: boolean;
  tipPercent: Percentage;
  openingHours: OpeningHoursSlot[];
  receiptHeader: string | null;
  receiptFooter: string | null;
  /** Umbrales del KDS en minutos: a partir de ellos la comanda pasa a amarillo / rojo. */
  kdsWarningMinutes: number;
  kdsCriticalMinutes: number;
  businessMode: BusinessMode;
  updatedAt: IsoDateTime;
}

export interface PrinterDto extends Timestamps {
  id: Uuid;
  name: string;
  kind: PrinterKind;
  connection: PrinterConnection;
  /** IP:puerto, ruta del dispositivo USB o nombre de la impresora del sistema operativo. */
  address: string | null;
  paperWidthMm: number;
  purposes: PrinterPurpose[];
  isActive: boolean;
}

export interface NumberingRangeDto extends Timestamps {
  id: Uuid;
  documentType: FiscalDocumentType;
  prefix: string;
  rangeFrom: number;
  rangeTo: number;
  nextNumber: number;
  resolutionNumber: string | null;
  resolutionDate: IsoDate | null;
  validFrom: IsoDate | null;
  validUntil: IsoDate | null;
  isActive: boolean;
}

export interface TaxBreakdownLine {
  taxName: string;
  rate: Percentage;
  base: MinorUnits;
  amount: MinorUnits;
}

export interface InvoiceDto extends Timestamps {
  id: Uuid;
  orderId: Uuid;
  customerId: Uuid | null;
  documentType: FiscalDocumentType;
  status: InvoiceStatus;
  prefix: string;
  number: number;
  /** Prefijo + número, p. ej. `POS-1043`. */
  fullNumber: string;
  subtotal: MinorUnits;
  taxTotal: MinorUnits;
  tipAmount: MinorUnits;
  total: MinorUnits;
  currency: string;
  taxBreakdown: TaxBreakdownLine[];
  /** Adaptador que emitió el documento (`local`, proveedor DIAN, …). */
  provider: string;
  /** Código de autorización fiscal (CUFE/CUDE en Colombia). */
  fiscalCode: string | null;
  issuedAt: IsoDateTime;
  voidedAt: IsoDateTime | null;
}
