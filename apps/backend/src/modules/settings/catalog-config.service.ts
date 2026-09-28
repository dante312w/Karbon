import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type FiscalDocumentType,
  type NumberingRangeDto,
  type PrinterDto,
  type TaxDto,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateNumberingRangeDto,
  CreatePrinterDto,
  CreateTaxDto,
  UpdatePrinterDto,
  UpdateTaxDto,
} from './settings.dto.js';
import { toNumberingRangeDto, toPrinterDto, toTaxDto } from './settings.mapper.js';

export interface TakenNumber {
  rangeId: string;
  prefix: string;
  number: number;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** Impuestos, impresoras y numeración: configuración de apoyo para catálogo y facturación. */
@Injectable()
export class ConfigCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Impuestos ──────────────────────────────────────────────────────────────

  async listTaxes(): Promise<TaxDto[]> {
    const taxes = await this.prisma.tax.findMany({
      orderBy: [{ isDefault: 'desc' }, { rate: 'asc' }],
    });
    return taxes.map(toTaxDto);
  }

  async createTax(dto: CreateTaxDto, user: AuthenticatedUser): Promise<TaxDto> {
    const tax = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.tax.updateMany({ data: { isDefault: false } });
      const created = await tx.tax.create({ data: dto });
      await this.audit.log(
        { userId: user.id, action: 'tax.create', entity: 'tax', entityId: created.id },
        tx,
      );
      return created;
    });
    return toTaxDto(tax);
  }

  async updateTax(id: string, dto: UpdateTaxDto, user: AuthenticatedUser): Promise<TaxDto> {
    const tax = await this.prisma.$transaction(async (tx) => {
      await tx.tax.findUniqueOrThrow({ where: { id } });
      if (dto.isDefault)
        await tx.tax.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      const updated = await tx.tax.update({ where: { id }, data: dto });
      await this.audit.log(
        {
          userId: user.id,
          action: 'tax.update',
          entity: 'tax',
          entityId: id,
          metadata: { ...dto },
        },
        tx,
      );
      return updated;
    });
    return toTaxDto(tax);
  }

  async defaultTaxRate(tx: Tx): Promise<number> {
    const tax = await tx.tax.findFirst({ where: { isDefault: true, isActive: true } });
    return tax ? tax.rate.toNumber() : 0;
  }

  // ─── Impresoras ─────────────────────────────────────────────────────────────

  async listPrinters(): Promise<PrinterDto[]> {
    const printers = await this.prisma.printer.findMany({ orderBy: { name: 'asc' } });
    return printers.map(toPrinterDto);
  }

  async createPrinter(dto: CreatePrinterDto): Promise<PrinterDto> {
    return toPrinterDto(await this.prisma.printer.create({ data: dto }));
  }

  async updatePrinter(id: string, dto: UpdatePrinterDto): Promise<PrinterDto> {
    return toPrinterDto(await this.prisma.printer.update({ where: { id }, data: dto }));
  }

  async deletePrinter(id: string): Promise<void> {
    await this.prisma.printer.delete({ where: { id } });
  }

  // ─── Numeración ─────────────────────────────────────────────────────────────

  async listNumberingRanges(): Promise<NumberingRangeDto[]> {
    const ranges = await this.prisma.numberingRange.findMany({
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
    });
    return ranges.map(toNumberingRangeDto);
  }

  async createNumberingRange(
    dto: CreateNumberingRangeDto,
    user: AuthenticatedUser,
  ): Promise<NumberingRangeDto> {
    if (dto.rangeFrom > dto.rangeTo) throw badRequest('El rango inicial supera al final');
    const range = await this.prisma.numberingRange.create({
      data: {
        documentType: dto.documentType,
        prefix: dto.prefix,
        rangeFrom: dto.rangeFrom,
        rangeTo: dto.rangeTo,
        nextNumber: dto.rangeFrom,
        resolutionNumber: dto.resolutionNumber ?? null,
        resolutionDate: toDate(dto.resolutionDate),
        validFrom: toDate(dto.validFrom),
        validUntil: toDate(dto.validUntil),
        technicalKey: dto.technicalKey ?? null,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'numbering.create',
      entity: 'numbering_range',
      entityId: range.id,
    });
    return toNumberingRangeDto(range);
  }

  async setNumberingRangeActive(id: string, isActive: boolean): Promise<NumberingRangeDto> {
    return toNumberingRangeDto(
      await this.prisma.numberingRange.update({ where: { id }, data: { isActive } }),
    );
  }

  /**
   * Toma el siguiente consecutivo de forma atómica (bloqueo de fila): dos cajas nunca
   * emiten el mismo número.
   */
  async takeNextNumber(tx: Tx, documentType: FiscalDocumentType): Promise<TakenNumber> {
    const rows = await tx.$queryRaw<{ id: string; prefix: string; number: number }[]>`
      UPDATE numbering_ranges
         SET next_number = next_number + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM numbering_ranges
          WHERE document_type = ${documentType}::fiscal_document_type
            AND is_active
            AND next_number <= range_to
            AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE)
      RETURNING id, prefix, next_number - 1 AS number`;
    const taken = rows[0];
    if (!taken) {
      throw conflict(
        ErrorCode.NUMBERING_RANGE_EXHAUSTED,
        'No hay un rango de numeración vigente para este tipo de documento',
      );
    }
    return { rangeId: taken.id, prefix: taken.prefix, number: taken.number };
  }
}
