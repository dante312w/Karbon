import type {
  NumberingRangeDto,
  OpeningHoursSlot,
  PrinterDto,
  RestaurantSettingsDto,
  TaxDto,
} from '@karbon/types';
import type {
  NumberingRange,
  Printer,
  RestaurantSettings,
  Tax,
} from '../../generated/prisma/client.js';
import { dateOnly, iso, num, timestamps } from '../../common/mapping.js';

const LOGO_URL = '/api/v1/settings/logo';

export function toSettingsDto(settings: RestaurantSettings): RestaurantSettingsDto {
  return {
    branchId: settings.branchId,
    name: settings.name,
    legalName: settings.legalName,
    taxId: settings.taxId,
    address: settings.address,
    city: settings.city,
    phone: settings.phone,
    email: settings.email,
    // El parámetro de versión invalida la caché del navegador al cambiar el logo.
    logoUrl: settings.logoPath ? `${LOGO_URL}?v=${settings.updatedAt.getTime()}` : null,
    currency: settings.currency,
    locale: settings.locale,
    timezone: settings.timezone,
    pricesIncludeTax: settings.pricesIncludeTax,
    tipEnabled: settings.tipEnabled,
    tipPercent: num(settings.tipPercent),
    openingHours: settings.openingHours as OpeningHoursSlot[],
    receiptHeader: settings.receiptHeader,
    receiptFooter: settings.receiptFooter,
    kdsWarningMinutes: settings.kdsWarningMinutes,
    kdsCriticalMinutes: settings.kdsCriticalMinutes,
    businessMode: settings.businessMode,
    updatedAt: iso(settings.updatedAt),
  };
}

export function toTaxDto(tax: Tax): TaxDto {
  return {
    id: tax.id,
    name: tax.name,
    kind: tax.kind,
    rate: num(tax.rate),
    isDefault: tax.isDefault,
    isActive: tax.isActive,
    ...timestamps(tax),
  };
}

export function toPrinterDto(printer: Printer): PrinterDto {
  return {
    id: printer.id,
    name: printer.name,
    kind: printer.kind,
    connection: printer.connection,
    address: printer.address,
    paperWidthMm: printer.paperWidthMm,
    purposes: printer.purposes,
    isActive: printer.isActive,
    ...timestamps(printer),
  };
}

export function toNumberingRangeDto(range: NumberingRange): NumberingRangeDto {
  return {
    id: range.id,
    documentType: range.documentType,
    prefix: range.prefix,
    rangeFrom: range.rangeFrom,
    rangeTo: range.rangeTo,
    nextNumber: range.nextNumber,
    resolutionNumber: range.resolutionNumber,
    resolutionDate: dateOnly(range.resolutionDate),
    validFrom: dateOnly(range.validFrom),
    validUntil: dateOnly(range.validUntil),
    isActive: range.isActive,
    ...timestamps(range),
  };
}
