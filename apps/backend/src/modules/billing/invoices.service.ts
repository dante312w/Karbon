import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  FiscalDocumentType,
  type InvoiceDto,
  InvoiceStatus,
  OrderStatus,
  type Paginated,
  type ReceiptDocument,
  type TaxBreakdownLine,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import { dateRange, pageArgs, paginated } from '../../common/http/pagination.js';
import { iso, isoOrNull, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';
import type { Invoice, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ConfigCatalogService } from '../settings/catalog-config.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { InvoiceQueryDto, IssueInvoiceDto } from './billing.dto.js';
import { FiscalProviderRegistry } from './fiscal-provider.js';
import { ReceiptBuilder } from './receipt-builder.service.js';

/** Busca por número completo ("T15") o solo el consecutivo ("15"). */
function documentNumberFilter(search: string | undefined): Prisma.InvoiceWhereInput {
  const match = search ? /^([A-Za-z]*)(\d+)$/.exec(search.trim()) : null;
  if (!match?.[2]) return {};
  return { number: Number(match[2]), ...(match[1] ? { prefix: match[1].toUpperCase() } : {}) };
}

function toInvoiceDto(invoice: Invoice, currency: string): InvoiceDto {
  const minor = (value: Prisma.Decimal): number => decimalToMinor(value, currency);
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    customerId: invoice.customerId,
    documentType: invoice.documentType,
    status: invoice.status,
    prefix: invoice.prefix,
    number: invoice.number,
    fullNumber: `${invoice.prefix}${invoice.number}`,
    subtotal: minor(invoice.subtotal),
    taxTotal: minor(invoice.taxTotal),
    tipAmount: minor(invoice.tipAmount),
    total: minor(invoice.total),
    currency: invoice.currency,
    taxBreakdown: invoice.taxBreakdown as unknown as TaxBreakdownLine[],
    provider: invoice.provider,
    fiscalCode: invoice.fiscalCode,
    issuedAt: iso(invoice.issuedAt),
    voidedAt: isoOrNull(invoice.voidedAt),
    ...timestamps(invoice),
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigCatalogService,
    private readonly providers: FiscalProviderRegistry,
    private readonly receipts: ReceiptBuilder,
    private readonly audit: AuditService,
  ) {}

  /** Emite el documento de un pedido pagado. Emitir dos veces devuelve el mismo documento. */
  async issue(orderId: string, dto: IssueInvoiceDto, user: AuthenticatedUser): Promise<InvoiceDto> {
    const settings = await this.settings.get();
    const documentType = dto.documentType ?? FiscalDocumentType.RECEIPT;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) throw notFound('El pedido');
    if (order.status !== OrderStatus.PAID) {
      throw conflict(ErrorCode.INVALID_STATUS_TRANSITION, 'Solo se facturan pedidos pagados');
    }
    const existing = await this.prisma.invoice.findFirst({
      where: { orderId, documentType, status: { not: InvoiceStatus.VOIDED } },
    });
    if (existing) return toInvoiceDto(existing, settings.currency);

    const provider = this.providers.for(documentType);
    const breakdown = await this.receipts.breakdownForOrder(orderId);
    const customerId = dto.customerId ?? order.customerId;
    const invoice = await this.prisma.$transaction(async (tx) => {
      const taken = await this.config.takeNextNumber(tx, documentType);
      const range = await tx.numberingRange.findUniqueOrThrow({ where: { id: taken.rangeId } });
      const issuedAt = new Date();
      const customer = customerId
        ? await tx.customer.findUnique({ where: { id: customerId } })
        : null;
      const result = await provider.issue({
        branchId: settings.branchId,
        documentType,
        prefix: taken.prefix,
        number: taken.number,
        total: order.total.toString(),
        currency: settings.currency,
        issuedAt,
        customerDocument: customer?.documentNumber ?? null,
        technicalKey: range.technicalKey,
      });
      const created = await tx.invoice.create({
        data: {
          orderId,
          customerId: customerId ?? null,
          numberingRangeId: taken.rangeId,
          issuedById: user.id,
          documentType,
          status: result.status,
          prefix: taken.prefix,
          number: taken.number,
          subtotal: order.subtotal,
          taxTotal: order.taxTotal,
          tipAmount: order.tipAmount,
          total: order.total,
          currency: settings.currency,
          taxBreakdown: breakdown.map((line) => ({ ...line })),
          provider: provider.name,
          externalId: result.externalId,
          fiscalCode: result.fiscalCode,
          qrData: result.qrData,
          ...(result.response === null ? {} : { providerResponse: result.response }),
          issuedAt,
        },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'invoice.issue',
          entity: 'invoice',
          entityId: created.id,
          metadata: { number: `${taken.prefix}${taken.number}` },
        },
        tx,
      );
      return created;
    });
    return toInvoiceDto(invoice, settings.currency);
  }

  async get(id: string): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw notFound('El documento');
    return toInvoiceDto(invoice, await this.settings.currency());
  }

  async list(query: InvoiceQueryDto): Promise<Paginated<InvoiceDto>> {
    const currency = await this.settings.currency();
    const where: Prisma.InvoiceWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...dateRange('issuedAt', query),
      ...documentNumberFilter(query.search),
    };
    const [invoices, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, orderBy: { issuedAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginated(
      invoices.map((invoice) => toInvoiceDto(invoice, currency)),
      total,
      query,
    );
  }

  async void(id: string, reason: string, user: AuthenticatedUser): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw notFound('El documento');
    if (invoice.status === InvoiceStatus.VOIDED)
      throw conflict(ErrorCode.CONFLICT, 'El documento ya está anulado');
    if (invoice.provider !== 'local') {
      throw conflict(
        ErrorCode.CONFLICT,
        'Los documentos electrónicos se anulan con una nota crédito',
      );
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.VOIDED, voidedAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'invoice.void',
      entity: 'invoice',
      entityId: id,
      metadata: { reason },
    });
    return toInvoiceDto(updated, await this.settings.currency());
  }

  async document(id: string): Promise<ReceiptDocument> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { orderId: true },
    });
    if (!invoice) throw notFound('El documento');
    return this.receipts.forOrder(invoice.orderId, id);
  }
}
