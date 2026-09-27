import { Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  PaymentStatus,
  type ReceiptDocument,
  type TaxBreakdownLine,
} from '@karbon/types';
import { calculateOrderTotals, practicalUnit } from '@karbon/utils';
import { notFound } from '../../common/errors/domain-error.js';
import { iso, num } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toSettingsDto } from '../settings/settings.mapper.js';
import { SettingsService } from '../settings/settings.service.js';

const ORDER_FOR_RECEIPT = {
  table: { select: { name: true } },
  waiter: { select: { name: true } },
  customer: { select: { name: true, documentType: true, documentNumber: true } },
  items: {
    where: { status: { not: OrderItemStatus.CANCELLED } },
    orderBy: { sortOrder: 'asc' as const },
  },
  payments: {
    where: { status: PaymentStatus.COMPLETED },
    orderBy: { createdAt: 'asc' as const },
    include: { receivedBy: { select: { name: true } } },
  },
};

/** Arma el modelo de presentación de precuentas y comprobantes (ticket, A4, PDF). */
@Injectable()
export class ReceiptBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async taxNames(): Promise<Map<number, string>> {
    const taxes = await this.prisma.tax.findMany();
    return new Map(taxes.map((tax) => [num(tax.rate), tax.name]));
  }

  /** Desglose de impuestos por tarifa, con el mismo cálculo que los totales del pedido. */
  async breakdownForOrder(orderId: string): Promise<TaxBreakdownLine[]> {
    const settings = await this.settings.get();
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { where: { status: { not: OrderItemStatus.CANCELLED } } } },
    });
    const totals = calculateOrderTotals(
      order.items.map((item) => ({
        unitPrice: decimalToMinor(item.unitPrice, settings.currency),
        quantity: item.quantity,
        taxRate: num(item.taxRate),
        discount: decimalToMinor(item.discount, settings.currency),
      })),
      {
        pricesIncludeTax: settings.pricesIncludeTax,
        tipPercent: num(order.tipPercent),
        tipRoundingUnit: practicalUnit(settings.currency),
      },
    );
    const names = await this.taxNames();
    return totals.taxBreakdown.map((entry) => ({
      taxName: names.get(entry.rate) ?? `Impuesto ${entry.rate} %`,
      rate: entry.rate,
      base: entry.base,
      amount: entry.amount,
    }));
  }

  async forOrder(orderId: string, invoiceId?: string): Promise<ReceiptDocument> {
    const settings = await this.settings.get();
    const settingsDto = toSettingsDto(settings);
    const currency = settings.currency;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_FOR_RECEIPT,
    });
    if (!order) throw notFound('El pedido');
    const invoice = invoiceId
      ? await this.prisma.invoice.findUnique({ where: { id: invoiceId } })
      : null;
    const minor = (value: Parameters<typeof decimalToMinor>[0]): number =>
      decimalToMinor(value, currency);

    const taxes = invoice
      ? (invoice.taxBreakdown as unknown as TaxBreakdownLine[])
      : await this.breakdownForOrder(order.id);
    const customer = order.customer;
    return {
      title: invoice ? this.titleFor(invoice.documentType) : 'Precuenta',
      business: {
        name: settings.name,
        legalName: settings.legalName,
        taxId: settings.taxId,
        address: settings.address,
        city: settings.city,
        phone: settings.phone,
        header: settings.receiptHeader,
        footer: settings.receiptFooter,
        logoUrl: settingsDto.logoUrl,
      },
      documentNumber: invoice ? `${invoice.prefix}${invoice.number}` : null,
      issuedAt: iso(invoice?.issuedAt ?? new Date()),
      orderNumber: order.number,
      tableName: order.table?.name ?? null,
      label: order.label,
      waiterName: order.waiter.name,
      cashierName: order.payments.at(-1)?.receivedBy.name ?? null,
      customer: customer
        ? {
            name: customer.name,
            document: customer.documentNumber
              ? `${customer.documentType ?? ''} ${customer.documentNumber}`.trim()
              : null,
          }
        : null,
      lines: order.items.map((item) => ({
        quantity: item.quantity,
        description: item.productName,
        unitPrice: minor(item.unitPrice),
        total: minor(item.total),
        notes: item.notes,
      })),
      subtotal: minor(invoice?.subtotal ?? order.subtotal),
      discountTotal: minor(order.discountTotal),
      taxes: taxes.map((line) => ({
        name: line.taxName,
        rate: line.rate,
        base: line.base,
        amount: line.amount,
      })),
      tipAmount: minor(invoice?.tipAmount ?? order.tipAmount),
      total: minor(invoice?.total ?? order.total),
      payments: order.payments.map((payment) => ({
        method: payment.method,
        amount: minor(payment.amount),
        tendered: payment.tendered ? minor(payment.tendered) : null,
        change: payment.change ? minor(payment.change) : null,
      })),
      currency,
      locale: settings.locale,
      fiscalCode: invoice?.fiscalCode ?? null,
      qrData: invoice?.qrData ?? null,
    };
  }

  private titleFor(documentType: string): string {
    switch (documentType) {
      case 'INVOICE':
        return 'Factura de venta';
      case 'ELECTRONIC_INVOICE':
        return 'Factura electrónica de venta';
      case 'POS_EQUIVALENT':
        return 'Documento equivalente POS';
      case 'CREDIT_NOTE':
        return 'Nota crédito';
      default:
        return 'Tiquete de venta';
    }
  }
}
