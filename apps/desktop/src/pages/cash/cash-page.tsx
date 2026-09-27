import {
  queryKeys,
  useApi,
  useApiMutation,
  useCashSession,
  useHasPermission,
  useMoney,
  useSettings,
} from '@karbon/client';
import {
  type CashSessionDto,
  type CashSessionSummaryDto,
  type ExpenseDto,
  type InvoiceDto,
  Permission,
} from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  notifyError,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@karbon/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownUpIcon,
  BanknoteIcon,
  FileTextIcon,
  LockIcon,
  PrinterIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  Trash2Icon,
  WalletIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { formatDateTime, formatTime } from '../../lib/format';
import { useReceiptPrinter } from '../../lib/printing';
import { CashReport } from './cash-report';
import { CloseCashDialog, ExpenseDialog, MovementDialog, OpenCashForm } from './cash-dialogs';

type Modal = 'close' | 'movement' | 'expense' | null;

export default function CashPage() {
  const cash = useCashSession();
  const canExpense = useHasPermission(Permission.EXPENSES_WRITE);
  const canInvoices = useHasPermission(Permission.INVOICES_ISSUE);
  const [modal, setModal] = useState<Modal>(null);
  const summary = cash.data ?? null;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Caja"
        description={
          summary
            ? `Turno abierto desde las ${formatTime(summary.session.openedAt)} por ${summary.session.openedBy.name}`
            : 'Caja cerrada'
        }
        actions={
          canExpense ? (
            <Button
              variant="outline"
              onClick={() => {
                setModal('expense');
              }}
            >
              <ShoppingBagIcon /> Registrar gasto
            </Button>
          ) : null
        }
      />
      <Tabs defaultValue="turno" className="flex flex-col gap-4 p-5">
        <TabsList className="self-start">
          <TabsTrigger value="turno">Turno actual</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          {canInvoices ? <TabsTrigger value="facturas">Facturas</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="turno">
          {cash.isPending ? (
            <Spinner />
          ) : summary ? (
            <CurrentSession summary={summary} onModal={setModal} />
          ) : (
            <OpenCashForm />
          )}
        </TabsContent>
        <TabsContent value="historial">
          <SessionsHistory />
        </TabsContent>
        <TabsContent value="gastos">
          <ExpensesList />
        </TabsContent>
        {canInvoices ? (
          <TabsContent value="facturas">
            <InvoicesList />
          </TabsContent>
        ) : null}
      </Tabs>

      {modal === 'movement' ? (
        <MovementDialog
          onClose={() => {
            setModal(null);
          }}
        />
      ) : null}
      {modal === 'expense' ? (
        <ExpenseDialog
          hasOpenSession={summary !== null}
          onClose={() => {
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CurrentSession({
  summary,
  onModal,
}: {
  summary: CashSessionSummaryDto;
  onModal: (modal: Modal) => void;
}) {
  const api = useApi();
  const money = useMoney();
  const settings = useSettings().data;
  const printer = useReceiptPrinter();
  const canClose = useHasPermission(Permission.CASH_CLOSE);
  const canMove = useHasPermission(Permission.CASH_MOVEMENTS);
  const [closing, setClosing] = useState(false);
  const movements = useQuery({
    queryKey: [...queryKeys.cash, 'movements', summary.session.id],
    queryFn: () => api.cash.movements(summary.session.id),
  });

  const printReport = (report: CashSessionSummaryDto): void => {
    void printer
      .printElement(
        'Cierre de caja',
        <CashReport summary={report} businessName={settings?.name ?? 'Karbon POS'} money={money} />,
      )
      .catch(notifyError);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ventas del turno"
          value={money(summary.salesTotal)}
          icon={WalletIcon}
          hint={`${summary.ordersPaid} pedidos pagados`}
        />
        <StatCard
          label="Efectivo esperado"
          value={money(summary.expectedCash)}
          icon={BanknoteIcon}
          hint={`Base ${money(summary.session.openingAmount)}`}
        />
        <StatCard
          label="Ingresos / retiros"
          value={money(summary.incomes - summary.withdrawals)}
          icon={ArrowDownUpIcon}
          hint={`Gastos en efectivo ${money(summary.cashExpenses)}`}
        />
        <StatCard
          label="Pedidos abiertos"
          value={summary.openOrders}
          icon={ReceiptIcon}
          tone={summary.openOrders > 0 ? 'negative' : 'default'}
          hint={summary.openOrders > 0 ? 'Pendientes de cobro' : 'Todo cobrado'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Ventas por método</h2>
          {summary.byMethod.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay pagos en este turno.</p>
          ) : null}
          {summary.byMethod.map((line) => (
            <div key={line.method} className="flex items-center justify-between text-sm">
              <span>
                {PAYMENT_METHOD_LABEL[line.method]}{' '}
                <span className="text-muted-foreground">({line.count})</span>
              </span>
              <span className="font-semibold tabular-nums">{money(line.amount)}</span>
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Movimientos de efectivo</h2>
            {canMove ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onModal('movement');
                }}
              >
                <ArrowDownUpIcon /> Nuevo
              </Button>
            ) : null}
          </div>
          {(movements.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos.</p>
          ) : null}
          {(movements.data ?? []).map((movement) => (
            <div key={movement.id} className="flex items-center justify-between text-sm">
              <span>
                {formatTime(movement.createdAt)} · {movement.description}
              </span>
              <span
                className={
                  movement.type === 'WITHDRAWAL' ? 'text-destructive tabular-nums' : 'tabular-nums'
                }
              >
                {movement.type === 'WITHDRAWAL' ? '−' : '+'}
                {money(movement.amount)}
              </span>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            printReport(summary);
          }}
        >
          <PrinterIcon /> Imprimir corte parcial
        </Button>
        {canClose ? (
          <Button
            onClick={() => {
              setClosing(true);
            }}
          >
            <LockIcon /> Cerrar caja
          </Button>
        ) : null}
      </div>

      {closing ? (
        <CloseCashDialog
          summary={summary}
          onClose={() => {
            setClosing(false);
          }}
          onClosed={(closed) => {
            setClosing(false);
            toast.success('Caja cerrada');
            printReport(closed);
          }}
        />
      ) : null}
    </div>
  );
}

function SessionsHistory() {
  const api = useApi();
  const money = useMoney();
  const settings = useSettings().data;
  const printer = useReceiptPrinter();
  const [page, setPage] = useState(1);
  const sessions = useQuery({
    queryKey: [...queryKeys.cash, 'sessions', page],
    queryFn: () => api.cash.sessions({ page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const reprint = async (session: CashSessionDto): Promise<void> => {
    const report = await api.cash.summary(session.id);
    await printer.printElement(
      'Cierre de caja',
      <CashReport summary={report} businessName={settings?.name ?? 'Karbon POS'} money={money} />,
    );
  };
  const columns: Column<CashSessionDto>[] = [
    { key: 'opened', header: 'Apertura', cell: (session) => formatDateTime(session.openedAt) },
    {
      key: 'closed',
      header: 'Cierre',
      cell: (session) =>
        session.closedAt ? formatDateTime(session.closedAt) : <Badge>Abierta</Badge>,
    },
    {
      key: 'user',
      header: 'Responsable',
      cell: (session) => session.closedBy?.name ?? session.openedBy.name,
    },
    {
      key: 'expected',
      header: 'Esperado',
      align: 'right',
      cell: (session) => (session.expectedCash === null ? '—' : money(session.expectedCash)),
    },
    {
      key: 'counted',
      header: 'Contado',
      align: 'right',
      cell: (session) => (session.countedCash === null ? '—' : money(session.countedCash)),
    },
    {
      key: 'difference',
      header: 'Diferencia',
      align: 'right',
      cell: (session) =>
        session.difference === null ? (
          '—'
        ) : (
          <span
            className={
              session.difference < 0
                ? 'font-semibold text-destructive'
                : session.difference > 0
                  ? 'font-semibold text-status-occupied'
                  : ''
            }
          >
            {money(session.difference)}
          </span>
        ),
    },
    {
      key: 'print',
      header: '',
      align: 'right',
      cell: (session) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Imprimir cierre"
          onClick={() => {
            void reprint(session).catch(notifyError);
          }}
        >
          <PrinterIcon />
        </Button>
      ),
    },
  ];
  if (sessions.isPending) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={sessions.data?.items ?? []}
        rowKey={(session) => session.id}
        empty={<EmptyState icon={WalletIcon} title="Sin turnos registrados" />}
      />
      <Pagination page={page} total={sessions.data?.total ?? 0} pageSize={20} onPage={setPage} />
    </div>
  );
}

function ExpensesList() {
  const api = useApi();
  const money = useMoney();
  const canWrite = useHasPermission(Permission.EXPENSES_WRITE);
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<ExpenseDto | null>(null);
  const expenses = useQuery({
    queryKey: [...queryKeys.expenses, page],
    queryFn: () => api.cash.expenses({ page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const remove = useApiMutation(
    (id: string) => api.cash.removeExpense(id),
    [queryKeys.expenses, queryKeys.cash, queryKeys.reports],
  );
  const columns: Column<ExpenseDto>[] = [
    { key: 'date', header: 'Fecha', cell: (expense) => formatDateTime(expense.incurredAt) },
    { key: 'category', header: 'Categoría', cell: (expense) => expense.category },
    { key: 'description', header: 'Descripción', cell: (expense) => expense.description },
    {
      key: 'method',
      header: 'Pago',
      cell: (expense) =>
        `${PAYMENT_METHOD_LABEL[expense.paymentMethod]}${expense.cashSessionId ? ' (caja)' : ''}`,
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      cell: (expense) => <span className="tabular-nums">{money(expense.amount)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (expense) =>
        canWrite ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Eliminar gasto"
            onClick={() => {
              setRemoving(expense);
            }}
          >
            <Trash2Icon />
          </Button>
        ) : null,
    },
  ];
  if (expenses.isPending) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={expenses.data?.items ?? []}
        rowKey={(expense) => expense.id}
        empty={<EmptyState icon={ShoppingBagIcon} title="Sin gastos registrados" />}
      />
      <Pagination page={page} total={expenses.data?.total ?? 0} pageSize={25} onPage={setPage} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Eliminar gasto"
        description={removing ? `${removing.description} · ${money(removing.amount)}` : undefined}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => remove.mutateAsync(removing?.id ?? '')}
      />
    </div>
  );
}

const DOCUMENT_TYPE_LABEL: Record<InvoiceDto['documentType'], string> = {
  RECEIPT: 'Tiquete',
  POS_EQUIVALENT: 'Doc. equivalente POS',
  INVOICE: 'Factura',
  ELECTRONIC_INVOICE: 'Factura electrónica',
  CREDIT_NOTE: 'Nota crédito',
};

function InvoicesList() {
  const api = useApi();
  const money = useMoney();
  const printer = useReceiptPrinter();
  const canVoid = useHasPermission(Permission.INVOICES_VOID);
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<InvoiceDto | null>(null);
  const invoices = useQuery({
    queryKey: [...queryKeys.invoices, page],
    queryFn: () => api.invoices.list({ page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const voidInvoice = useApiMutation(
    ({ id, reason }: { id: string; reason: string }) => api.invoices.void(id, reason),
    [queryKeys.invoices],
  );
  const columns: Column<InvoiceDto>[] = [
    {
      key: 'number',
      header: 'Número',
      cell: (invoice) => <span className="font-semibold">{invoice.fullNumber}</span>,
    },
    { key: 'type', header: 'Tipo', cell: (invoice) => DOCUMENT_TYPE_LABEL[invoice.documentType] },
    { key: 'date', header: 'Fecha', cell: (invoice) => formatDateTime(invoice.issuedAt) },
    {
      key: 'status',
      header: 'Estado',
      cell: (invoice) =>
        invoice.status === 'VOIDED' ? (
          <Badge variant="destructive">Anulada</Badge>
        ) : (
          <Badge variant="secondary">Emitida</Badge>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (invoice) => <span className="tabular-nums">{money(invoice.total)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (invoice) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reimprimir"
            onClick={() => {
              void printer.print({ kind: 'invoice', invoiceId: invoice.id }).catch(notifyError);
            }}
          >
            <PrinterIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Guardar PDF"
            onClick={() => {
              void printer
                .savePdf({ kind: 'invoice', invoiceId: invoice.id }, `${invoice.fullNumber}.pdf`)
                .catch(notifyError);
            }}
          >
            <FileTextIcon />
          </Button>
          {canVoid && invoice.status !== 'VOIDED' ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setVoiding(invoice);
              }}
            >
              Anular
            </Button>
          ) : null}
        </span>
      ),
    },
  ];
  if (invoices.isPending) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={invoices.data?.items ?? []}
        rowKey={(invoice) => invoice.id}
        empty={<EmptyState icon={FileTextIcon} title="Aún no hay documentos emitidos" />}
      />
      <Pagination page={page} total={invoices.data?.total ?? 0} pageSize={25} onPage={setPage} />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        title={`Anular ${voiding?.fullNumber ?? ''}`}
        description="El documento queda anulado; el consecutivo no se reutiliza."
        confirmLabel="Anular documento"
        destructive
        requireReason
        onConfirm={(reason) => voidInvoice.mutateAsync({ id: voiding?.id ?? '', reason })}
      />
    </div>
  );
}
