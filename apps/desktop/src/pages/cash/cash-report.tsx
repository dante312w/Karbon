import type { CashSessionSummaryDto } from '@karbon/types';
import { PAYMENT_METHOD_LABEL } from '@karbon/ui';

/** Reporte de cierre (o corte parcial) para imprimir y archivar. */
export function CashReport({
  summary,
  businessName,
  money,
}: {
  summary: CashSessionSummaryDto;
  businessName: string;
  money: (amount: number) => string;
}) {
  const { session } = summary;
  const rows: [string, string][] = [
    ['Apertura', new Date(session.openedAt).toLocaleString('es-CO')],
    ['Abrió', session.openedBy.name],
    ...(session.closedAt
      ? ([['Cierre', new Date(session.closedAt).toLocaleString('es-CO')]] as [string, string][])
      : []),
    ...(session.closedBy ? ([['Cerró', session.closedBy.name]] as [string, string][]) : []),
    ['Base inicial', money(session.openingAmount)],
    ['Pedidos pagados', String(summary.ordersPaid)],
    ['Ventas totales', money(summary.salesTotal)],
  ];
  const cashRows: [string, string][] = [
    ['Base', money(session.openingAmount)],
    ['+ Ventas en efectivo', money(summary.cashSales)],
    ['+ Ingresos', money(summary.incomes)],
    ['− Retiros', money(summary.withdrawals)],
    ['− Gastos en efectivo', money(summary.cashExpenses)],
    ['= Efectivo esperado', money(session.expectedCash ?? summary.expectedCash)],
    ...(session.countedCash === null
      ? []
      : ([['Efectivo contado', money(session.countedCash)]] as [string, string][])),
    ...(session.difference === null
      ? []
      : ([['Diferencia', money(session.difference)]] as [string, string][])),
  ];
  const table = (data: [string, string][]) => (
    <table className="w-full">
      <tbody>
        {data.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="text-right">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <article className="bg-white p-3 font-mono text-[12px] text-black">
      <h1 className="text-center text-sm font-bold">{businessName}</h1>
      <p className="text-center font-bold">
        {session.closedAt ? 'CIERRE DE CAJA' : 'CORTE PARCIAL'}
      </p>
      <hr className="my-2 border-dashed border-black" />
      {table(rows)}
      <hr className="my-2 border-dashed border-black" />
      <p className="font-bold">Ventas por método</p>
      {table(
        summary.byMethod.map((line) => [
          `${PAYMENT_METHOD_LABEL[line.method]} (${line.count})`,
          money(line.amount),
        ]),
      )}
      <hr className="my-2 border-dashed border-black" />
      <p className="font-bold">Arqueo de efectivo</p>
      {table(cashRows)}
      {session.notes ? <p className="mt-2">Notas: {session.notes}</p> : null}
      <p className="mt-6 text-center">_______________________</p>
      <p className="text-center">Firma responsable</p>
    </article>
  );
}
