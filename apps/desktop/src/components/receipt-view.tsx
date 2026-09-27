import type { ReceiptDocument } from '@karbon/types';
import { PAYMENT_METHOD_LABEL } from '@karbon/ui';
import { formatMoney } from '@karbon/utils';

/**
 * Comprobante en HTML: la misma plantilla sirve para impresoras del sistema (80 mm), factura A4
 * y exportación a PDF. El ancho lo decide la hoja de estilos de impresión.
 */
export function ReceiptView({
  document,
  paper = 'thermal',
}: {
  document: ReceiptDocument;
  paper?: 'thermal' | 'a4';
}) {
  const money = (amount: number): string =>
    formatMoney(amount, { currency: document.currency, locale: document.locale });
  const { business } = document;
  return (
    <article
      className={`receipt receipt--${paper} mx-auto bg-white p-4 font-mono text-[12px] leading-snug text-black`}
    >
      <header className="text-center">
        {business.logoUrl ? (
          <img src={business.logoUrl} alt="" className="mx-auto mb-1 max-h-16" />
        ) : null}
        <h1 className="text-base font-bold">{business.name}</h1>
        {business.legalName ? <p>{business.legalName}</p> : null}
        {business.taxId ? <p>NIT {business.taxId}</p> : null}
        {business.address ? (
          <p>{[business.address, business.city].filter(Boolean).join(', ')}</p>
        ) : null}
        {business.phone ? <p>Tel. {business.phone}</p> : null}
        {business.header ? <p className="mt-1 whitespace-pre-line">{business.header}</p> : null}
        <p className="mt-2 font-bold uppercase">{document.title}</p>
        {document.documentNumber ? <p>No. {document.documentNumber}</p> : null}
      </header>
      <hr className="my-2 border-dashed border-black" />
      <dl className="grid grid-cols-2 gap-x-2">
        <dt>Fecha</dt>
        <dd className="text-right">
          {new Date(document.issuedAt).toLocaleString(document.locale, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </dd>
        <dt>Pedido</dt>
        <dd className="text-right">#{document.orderNumber}</dd>
        {(document.tableName ?? document.label) ? (
          <>
            <dt>Mesa / cuenta</dt>
            <dd className="text-right">{document.tableName ?? document.label}</dd>
          </>
        ) : null}
        <dt>Atendió</dt>
        <dd className="text-right">{document.waiterName}</dd>
        {document.customer ? (
          <>
            <dt>Cliente</dt>
            <dd className="text-right">{document.customer.name}</dd>
          </>
        ) : null}
      </dl>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={index} className="align-top">
              <td className="pr-1">{line.quantity}</td>
              <td>
                {line.description}
                {line.notes ? <div className="text-[10px]">· {line.notes}</div> : null}
              </td>
              <td className="text-right whitespace-nowrap">{money(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <dl className="grid grid-cols-2 gap-x-2">
        <dt>Subtotal</dt>
        <dd className="text-right">{money(document.subtotal)}</dd>
        {document.discountTotal > 0 ? (
          <>
            <dt>Descuentos</dt>
            <dd className="text-right">-{money(document.discountTotal)}</dd>
          </>
        ) : null}
        {document.taxes.map((tax) => (
          <div key={tax.name} className="contents">
            <dt>{tax.name}</dt>
            <dd className="text-right">{money(tax.amount)}</dd>
          </div>
        ))}
        {document.tipAmount > 0 ? (
          <>
            <dt>Propina voluntaria</dt>
            <dd className="text-right">{money(document.tipAmount)}</dd>
          </>
        ) : null}
        <dt className="text-sm font-bold">TOTAL</dt>
        <dd className="text-right text-sm font-bold">{money(document.total)}</dd>
      </dl>
      {document.payments.length > 0 ? (
        <>
          <hr className="my-2 border-dashed border-black" />
          <dl className="grid grid-cols-2 gap-x-2">
            {document.payments.map((payment, index) => (
              <div key={index} className="contents">
                <dt>{PAYMENT_METHOD_LABEL[payment.method]}</dt>
                <dd className="text-right">{money(payment.amount)}</dd>
                {payment.change ? (
                  <>
                    <dt className="pl-2">Cambio</dt>
                    <dd className="text-right">{money(payment.change)}</dd>
                  </>
                ) : null}
              </div>
            ))}
          </dl>
        </>
      ) : null}
      <footer className="mt-3 text-center">
        {document.fiscalCode ? <p className="break-all">CUFE {document.fiscalCode}</p> : null}
        {business.footer ? <p className="whitespace-pre-line">{business.footer}</p> : null}
        <p className="mt-1 text-[10px]">Software: Karbon POS</p>
      </footer>
    </article>
  );
}
