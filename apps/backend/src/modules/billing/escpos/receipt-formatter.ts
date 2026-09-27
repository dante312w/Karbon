import type { KitchenTicketDto, PaymentMethod, ReceiptDocument } from '@karbon/types';
import { formatMoney } from '@karbon/utils';
import { EscPosBuilder, wrap } from './escpos-builder.js';

const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  QR: 'QR',
};

function money(amount: number, document: Pick<ReceiptDocument, 'currency' | 'locale'>): string {
  // Las impresoras térmicas no tienen espacio de no separación.
  return formatMoney(amount, { currency: document.currency, locale: document.locale }).replace(
    /\s/g,
    ' ',
  );
}

function localTime(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/** Comprobante o precuenta en ESC/POS. */
export function formatReceipt(
  document: ReceiptDocument,
  columns: number,
  openDrawer = false,
): Buffer {
  const printer = new EscPosBuilder(columns);
  const { business } = document;

  printer.align('center').bold(true).size(2, 2);
  for (const line of wrap(business.name, Math.floor(columns / 2))) printer.line(line);
  printer.size(1, 1).bold(false);
  for (const text of [
    business.legalName,
    business.taxId ? `NIT ${business.taxId}` : null,
    business.address,
    business.city,
    business.phone,
  ]) {
    if (text) printer.line(text);
  }
  if (business.header) for (const line of wrap(business.header, columns)) printer.line(line);

  printer.separator().bold(true).line(document.title.toUpperCase());
  if (document.documentNumber) printer.line(`No. ${document.documentNumber}`);
  printer.bold(false).align('left');
  printer.columnsLine('Fecha', localTime(document.issuedAt, document.locale));
  printer.columnsLine('Pedido', `#${document.orderNumber}`);
  const place = document.tableName ?? document.label;
  if (place) printer.columnsLine('Mesa / cuenta', place);
  printer.columnsLine('Atendió', document.waiterName);
  if (document.customer) {
    printer.columnsLine('Cliente', document.customer.name);
    if (document.customer.document) printer.columnsLine('Documento', document.customer.document);
  }

  printer.separator();
  for (const line of document.lines) {
    printer.columnsLine(`${line.quantity} ${line.description}`, money(line.total, document));
    if (line.notes) for (const note of wrap(`  ${line.notes}`, columns)) printer.line(note);
  }
  printer.separator();
  printer.columnsLine('Subtotal', money(document.subtotal, document));
  if (document.discountTotal > 0)
    printer.columnsLine('Descuentos', `-${money(document.discountTotal, document)}`);
  for (const tax of document.taxes) printer.columnsLine(tax.name, money(tax.amount, document));
  if (document.tipAmount > 0)
    printer.columnsLine('Propina voluntaria', money(document.tipAmount, document));
  printer
    .bold(true)
    .size(1, 2)
    .columnsLine('TOTAL', money(document.total, document))
    .size(1, 1)
    .bold(false);

  if (document.payments.length > 0) {
    printer.separator();
    for (const payment of document.payments) {
      printer.columnsLine(METHOD_LABEL[payment.method], money(payment.amount, document));
      if (payment.tendered !== null)
        printer.columnsLine('  Recibido', money(payment.tendered, document));
      if (payment.change) printer.columnsLine('  Cambio', money(payment.change, document));
    }
  }

  printer.align('center');
  if (document.fiscalCode) printer.separator().line('CUFE').line(document.fiscalCode);
  if (document.qrData) printer.feed(1).qr(document.qrData, 5);
  if (business.footer) {
    printer.feed(1);
    for (const line of wrap(business.footer, columns)) printer.line(line);
  }
  printer.line('Software: Karbon POS').feed(3);
  if (openDrawer) printer.openDrawer();
  return printer.cut().build();
}

/** Comanda de cocina/barra: letra grande y notas destacadas para leer a distancia. */
export function formatKitchenTicket(
  ticket: KitchenTicketDto,
  stationLabel: string,
  columns: number,
  locale: string,
): Buffer {
  const printer = new EscPosBuilder(columns);
  printer.align('center').bold(true).size(2, 2).line(stationLabel.toUpperCase());
  printer.line(`#${ticket.orderNumber}${ticket.tableName ? ` · ${ticket.tableName}` : ''}`);
  printer.size(1, 1).bold(false);
  printer.line(
    `Ronda ${ticket.sequence} · ${ticket.waiterName} · ${localTime(ticket.createdAt, locale)}`,
  );
  printer.separator().align('left');
  for (const item of ticket.items) {
    printer
      .bold(true)
      .size(1, 2)
      .line(`${item.quantity} x ${item.productName}`)
      .size(1, 1)
      .bold(false);
    if (item.notes) for (const line of wrap(`  >> ${item.notes}`, columns)) printer.line(line);
  }
  if (ticket.notes) printer.separator().line(ticket.notes);
  return printer.feed(4).cut().build();
}
