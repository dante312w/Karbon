import type { FiscalDocumentType, PaymentMethod } from '@karbon/types';

/** Textos que se imprimen en comprobantes y se muestran en las apps: una sola fuente. */

/** "Mixto" no aparece: es un pedido con varios pagos. */
export const PAYMENT_METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  QR: 'QR',
};

export const FISCAL_DOCUMENT_LABEL: Readonly<Record<FiscalDocumentType, string>> = {
  RECEIPT: 'Tiquete de venta',
  POS_EQUIVALENT: 'Documento equivalente POS',
  INVOICE: 'Factura de venta',
  ELECTRONIC_INVOICE: 'Factura electrónica de venta',
  CREDIT_NOTE: 'Nota crédito',
};
