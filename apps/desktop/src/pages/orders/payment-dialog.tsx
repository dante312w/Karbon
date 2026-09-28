import {
  newClientId,
  queryKeys,
  useApi,
  useApiMutation,
  useCashSession,
  useHasPermission,
  useMoney,
  useOrderMutation,
  useSettings,
} from '@karbon/client';
import {
  FiscalDocumentType,
  type OrderDto,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  type PaymentResultDto,
} from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  Select,
  toast,
} from '@karbon/ui';
import { FISCAL_DOCUMENT_LABEL, PAYMENT_METHOD_LABEL } from '@karbon/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BanknoteIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  FileTextIcon,
  LandmarkIcon,
  type LucideIcon,
  PrinterIcon,
  QrCodeIcon,
  Undo2Icon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { CustomerPicker } from '../../components/customer-picker';
import { MoneyInput } from '../../components/money-input';
import { tenderedSuggestions } from '../../lib/cash';
import { formatTime } from '../../lib/format';
import { useReceiptPrinter } from '../../lib/printing';

const METHOD_ICON: Record<PaymentMethod, LucideIcon> = {
  CASH: BanknoteIcon,
  CARD: CreditCardIcon,
  TRANSFER: LandmarkIcon,
  QR: QrCodeIcon,
};

/** La nota crédito no se emite al cobrar: corrige un documento ya emitido. */
const SALE_DOCUMENTS = [
  FiscalDocumentType.RECEIPT,
  FiscalDocumentType.POS_EQUIVALENT,
  FiscalDocumentType.INVOICE,
  FiscalDocumentType.ELECTRONIC_INVOICE,
] as const;

/** Cobro de un pedido: uno o varios pagos (mixto), cambio, propina y comprobante al terminar. */
export function PaymentDialog({
  order,
  onClose,
  onFinished,
}: {
  order: OrderDto;
  onClose: () => void;
  onFinished: () => void;
}) {
  const api = useApi();
  const money = useMoney();
  const queryClient = useQueryClient();
  const settings = useSettings().data;
  const cash = useCashSession();
  const canVoid = useHasPermission(Permission.PAYMENTS_VOID);
  const currency = settings?.currency ?? 'COP';
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = useState(order.pendingAmount);
  const [tendered, setTendered] = useState(order.pendingAmount);
  const [reference, setReference] = useState('');
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  // Misma llave en los reintentos del mismo cobro: el servidor nunca registra un pago doble.
  const attemptKey = useRef(newClientId());

  const payments = useQuery({
    queryKey: [...queryKeys.order(order.id), 'payments'],
    queryFn: () => api.orders.payments(order.id),
  });

  const applyResult = (result: PaymentResultDto): void => {
    queryClient.setQueryData(queryKeys.order(order.id), result.order);
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.order(order.id), 'payments'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cash });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    setAmount(result.order.pendingAmount);
    setTendered(result.order.pendingAmount);
    setReference('');
  };

  const pay = useApiMutation(
    () =>
      api.orders.pay(
        order.id,
        {
          method,
          amount,
          ...(method === PaymentMethod.CASH ? { tendered: Math.max(tendered, amount) } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
        attemptKey.current,
      ),
    [],
    {
      onSuccess: (result) => {
        attemptKey.current = newClientId();
        setLastChange(result.change);
        applyResult(result);
      },
      onError: notifyError,
    },
  );

  const voidPayment = useApiMutation(
    ({ id, reason }: { id: string; reason: string }) => api.orders.voidPayment(id, { reason }),
    [],
    { onSuccess: applyResult },
  );

  const tipOptions = [...new Set([0, settings?.tipPercent ?? 10, 10])].sort((a, b) => a - b);
  const setTip = useOrderMutation(
    order.id,
    (current, tipPercent: number) =>
      api.orders.update(order.id, { version: current.version, tipPercent }),
    {
      onSuccess: (updated) => {
        setAmount(updated.pendingAmount);
        setTendered(updated.pendingAmount);
      },
      onError: notifyError,
    },
  );

  const completed = order.status === OrderStatus.PAID;
  const activePayments = (payments.data ?? []).filter(
    (payment) => payment.status === PaymentStatus.COMPLETED,
  );
  // Un pedido en $0 (cortesía o descuento total) se cierra con un pago de 0.
  const closesFree = order.pendingAmount === 0;
  const change = method === PaymentMethod.CASH ? Math.max(0, tendered - amount) : 0;
  const invalidAmount = amount > order.pendingAmount || (amount <= 0 && !closesFree);
  const insufficient = method === PaymentMethod.CASH && tendered < amount;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) (completed ? onFinished : onClose)();
      }}
    >
      <DialogContent
        className="w-[min(96vw,56rem)]"
        title={completed ? 'Pago completado' : `Cobrar pedido #${order.number}`}
        description={order.tableName ?? order.label ?? undefined}
      >
        {completed ? (
          <CompletedPanel order={order} change={lastChange} onFinished={onFinished} />
        ) : cash.data === null ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="font-medium">No hay una caja abierta.</p>
            <p className="text-sm text-muted-foreground">Abre la caja para registrar pagos.</p>
            <Button asChild>
              <Link to="/caja">Ir a caja</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
            <section className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-muted/60 p-4 text-sm">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="text-right tabular-nums">{money(order.subtotal)}</dd>
                {order.discountTotal > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Descuentos</dt>
                    <dd className="text-right tabular-nums">-{money(order.discountTotal)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Impuestos</dt>
                <dd className="text-right tabular-nums">{money(order.taxTotal)}</dd>
                {settings?.tipEnabled ? (
                  <>
                    <dt className="text-muted-foreground">Propina ({order.tipPercent} %)</dt>
                    <dd className="text-right tabular-nums">{money(order.tipAmount)}</dd>
                  </>
                ) : null}
                <dt className="pt-2 text-base font-bold">Total</dt>
                <dd className="pt-2 text-right text-base font-bold tabular-nums">
                  {money(order.total)}
                </dd>
                {order.paidAmount > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Pagado</dt>
                    <dd className="text-right tabular-nums">{money(order.paidAmount)}</dd>
                    <dt className="font-semibold">Pendiente</dt>
                    <dd className="text-right font-semibold tabular-nums">
                      {money(order.pendingAmount)}
                    </dd>
                  </>
                ) : null}
              </dl>

              {settings?.tipEnabled && activePayments.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Propina voluntaria:</span>
                  {tipOptions.map((percent) => (
                    <Chip
                      key={percent}
                      active={order.tipPercent === percent}
                      disabled={setTip.isPending}
                      onClick={() => {
                        setTip.mutate(percent);
                      }}
                    >
                      {percent === 0 ? 'Sin propina' : `${percent} %`}
                    </Chip>
                  ))}
                </div>
              ) : null}

              {activePayments.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Pagos registrados</span>
                  {activePayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>
                        {PAYMENT_METHOD_LABEL[payment.method]} · {formatTime(payment.createdAt)}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {money(payment.amount)}
                        {canVoid ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Anular pago"
                            onClick={() => {
                              setVoiding(payment.id);
                            }}
                          >
                            <Undo2Icon />
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Método de pago">
                {Object.values(PaymentMethod).map((option) => {
                  const Icon = METHOD_ICON[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={method === option}
                      onClick={() => {
                        setMethod(option);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-semibold transition',
                        method === option ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                      )}
                    >
                      <Icon className="size-6" />
                      {PAYMENT_METHOD_LABEL[option]}
                    </button>
                  );
                })}
              </div>

              <Field
                label="Monto a cobrar con este método"
                {...(amount > order.pendingAmount ? { error: 'Supera el saldo pendiente' } : {})}
                hint="Cobra una parte para combinar métodos (pago mixto)"
              >
                {(id) => (
                  <MoneyInput
                    id={id}
                    className="h-12 text-lg font-semibold"
                    value={amount}
                    onValueChange={setAmount}
                  />
                )}
              </Field>

              {method === PaymentMethod.CASH ? (
                <>
                  <Field
                    label="Efectivo recibido"
                    {...(insufficient ? { error: 'Es menor que el monto a cobrar' } : {})}
                  >
                    {(id) => (
                      <MoneyInput
                        id={id}
                        className="h-12 text-lg"
                        value={tendered}
                        onValueChange={setTendered}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      active={tendered === amount}
                      onClick={() => {
                        setTendered(amount);
                      }}
                    >
                      Exacto
                    </Chip>
                    {tenderedSuggestions(amount, currency).map((suggestion) => (
                      <Chip
                        key={suggestion}
                        active={tendered === suggestion}
                        onClick={() => {
                          setTendered(suggestion);
                        }}
                      >
                        {money(suggestion)}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
                    <span className="font-medium">Cambio</span>
                    <span className="text-2xl font-bold tabular-nums">{money(change)}</span>
                  </div>
                </>
              ) : (
                <Field label="Referencia / aprobación (opcional)">
                  {(id) => (
                    <Input
                      id={id}
                      value={reference}
                      onChange={(event) => {
                        setReference(event.target.value);
                      }}
                    />
                  )}
                </Field>
              )}

              <Button
                size="touch"
                disabled={invalidAmount || insufficient || pay.isPending}
                onClick={() => {
                  pay.mutate(undefined);
                }}
              >
                {pay.isPending
                  ? 'Registrando…'
                  : closesFree
                    ? 'Cerrar pedido sin cobro'
                    : `Cobrar ${money(amount)}`}
              </Button>
            </section>
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        title="Anular pago"
        description="El pedido vuelve a quedar pendiente por ese valor y se revierte el inventario si ya se había descontado."
        confirmLabel="Anular pago"
        destructive
        requireReason
        onConfirm={(reason) => voidPayment.mutateAsync({ id: voiding ?? '', reason })}
      />
    </Dialog>
  );
}

function CompletedPanel({
  order,
  change,
  onFinished,
}: {
  order: OrderDto;
  change: number | null;
  onFinished: () => void;
}) {
  const api = useApi();
  const money = useMoney();
  const printer = useReceiptPrinter();
  const canInvoice = useHasPermission(Permission.INVOICES_ISSUE);
  const [documentType, setDocumentType] = useState<FiscalDocumentType>(FiscalDocumentType.RECEIPT);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    order.customerId && order.customerName
      ? { id: order.customerId, name: order.customerName }
      : null,
  );
  /** Emite el documento (o recupera el ya emitido) y lo imprime o exporta. */
  const output = useApiMutation(
    async (action: (invoiceId: string) => Promise<unknown>) => {
      const invoice = await api.invoices.issue(order.id, {
        documentType,
        customerId: customer?.id ?? null,
      });
      await action(invoice.id);
      return invoice;
    },
    [queryKeys.invoices],
    {
      onSuccess: (invoice) => {
        toast.success(`${FISCAL_DOCUMENT_LABEL[documentType]} ${invoice.fullNumber}`);
      },
      onError: notifyError,
    },
  );
  const busy = output.isPending;

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <CheckCircle2Icon className="size-14 text-primary" />
      <div>
        <p className="text-lg font-semibold">Pedido #{order.number} pagado</p>
        <p className="text-muted-foreground">Total {money(order.total)}</p>
      </div>
      {change ? (
        <div className="rounded-2xl bg-primary/10 px-8 py-4">
          <p className="text-sm font-medium">Cambio a entregar</p>
          <p className="text-4xl font-bold tabular-nums">{money(change)}</p>
        </div>
      ) : null}

      {canInvoice ? (
        <div className="grid w-full max-w-xl gap-3 text-left sm:grid-cols-2">
          <Field label="Documento">
            {(id) => (
              <Select
                id={id}
                value={documentType}
                onChange={(event) => {
                  setDocumentType(event.target.value as FiscalDocumentType);
                }}
              >
                {SALE_DOCUMENTS.map((type) => (
                  <option key={type} value={type}>
                    {FISCAL_DOCUMENT_LABEL[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cliente (opcional)">
            {() => <CustomerPicker value={customer} onChange={setCustomer} />}
          </Field>
        </div>
      ) : null}

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2">
        {canInvoice ? (
          <>
            <Button
              size="lg"
              disabled={busy}
              autoFocus
              onClick={() => {
                output.mutate((invoiceId) =>
                  printer.print({ kind: 'invoice', invoiceId }, { openDrawer: Boolean(change) }),
                );
              }}
            >
              <PrinterIcon /> Imprimir
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => {
                output.mutate((invoiceId) => printer.printA4({ kind: 'invoice', invoiceId }));
              }}
            >
              <FileTextIcon /> Hoja A4
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => {
                output.mutate((invoiceId) =>
                  printer.savePdf({ kind: 'invoice', invoiceId }, `pedido-${order.number}.pdf`),
                );
              }}
            >
              PDF
            </Button>
          </>
        ) : null}
        <Button variant="secondary" size="lg" onClick={onFinished}>
          Terminar
        </Button>
      </div>
    </div>
  );
}
