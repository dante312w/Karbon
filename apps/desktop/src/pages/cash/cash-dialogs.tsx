import { queryKeys, useApi, useApiMutation, useMoney } from '@karbon/client';
import { type CashSessionSummaryDto, CashMovementType, PaymentMethod } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  PAYMENT_METHOD_LABEL,
  Select,
  Switch,
  Textarea,
  toast,
} from '@karbon/ui';
import { useState } from 'react';
import { MoneyInput } from '../../components/money-input';

const EXPENSE_CATEGORIES = [
  'Insumos',
  'Servicios públicos',
  'Nómina',
  'Arriendo',
  'Mantenimiento',
  'Domicilios',
  'Otros',
] as const;

export function OpenCashForm() {
  const api = useApi();
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const open = useApiMutation(
    () => api.cash.open({ openingAmount: amount, notes: notes.trim() || null }),
    [queryKeys.cash],
    {
      onSuccess: () => toast.success('Caja abierta'),
      onError: notifyError,
    },
  );
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border bg-card p-6 shadow-soft">
      <div>
        <h2 className="text-lg font-semibold">Abrir caja</h2>
        <p className="text-sm text-muted-foreground">
          Cuenta el efectivo base con el que empieza el turno.
        </p>
      </div>
      <Field label="Base inicial en efectivo">
        {(id) => (
          <MoneyInput
            id={id}
            autoFocus
            className="h-12 text-lg font-semibold"
            value={amount}
            onValueChange={setAmount}
          />
        )}
      </Field>
      <Field label="Notas (opcional)">
        {(id) => (
          <Textarea
            id={id}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        )}
      </Field>
      <Button
        size="touch"
        disabled={open.isPending}
        onClick={() => {
          open.mutate(undefined);
        }}
      >
        Abrir caja
      </Button>
    </div>
  );
}

export function CloseCashDialog({
  summary,
  onClose,
  onClosed,
}: {
  summary: CashSessionSummaryDto;
  onClose: () => void;
  onClosed: (closed: CashSessionSummaryDto) => void;
}) {
  const api = useApi();
  const money = useMoney();
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const difference = counted - summary.expectedCash;
  const close = useApiMutation(
    () => api.cash.close(summary.session.id, { countedCash: counted, notes: notes.trim() || null }),
    [queryKeys.cash, queryKeys.reports],
    { onSuccess: onClosed, onError: notifyError },
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Cerrar caja (arqueo)"
        description="Cuenta el efectivo físico de la caja y regístralo."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={close.isPending}
              onClick={() => {
                close.mutate(undefined);
              }}
            >
              Cerrar caja
            </Button>
          </>
        }
      >
        {summary.openOrders > 0 ? (
          <p className="rounded-lg bg-status-waiting-food/15 p-3 text-sm">
            Hay {summary.openOrders} pedido(s) abierto(s). Puedes cerrar la caja; se cobrarán en el
            siguiente turno.
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-muted/60 p-4 text-sm">
          <dt>Efectivo esperado</dt>
          <dd className="text-right font-semibold tabular-nums">{money(summary.expectedCash)}</dd>
        </dl>
        <Field label="Efectivo contado">
          {(id) => (
            <MoneyInput
              id={id}
              autoFocus
              className="h-12 text-lg font-semibold"
              value={counted}
              onValueChange={setCounted}
            />
          )}
        </Field>
        <div
          className={cn(
            'flex items-center justify-between rounded-xl px-4 py-3',
            difference === 0
              ? 'bg-primary/10'
              : difference > 0
                ? 'bg-status-occupied/10'
                : 'bg-destructive/10',
          )}
        >
          <span className="font-medium">
            {difference === 0 ? 'Cuadra exacto' : difference > 0 ? 'Sobrante' : 'Faltante'}
          </span>
          <span className="text-xl font-bold tabular-nums">{money(difference)}</span>
        </div>
        <Field label="Notas del cierre">
          {(id) => (
            <Textarea
              id={id}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  );
}

export function MovementDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [type, setType] = useState<CashMovementType>(CashMovementType.WITHDRAWAL);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const save = useApiMutation(
    () => api.cash.addMovement({ type, amount, description: description.trim() }),
    [queryKeys.cash],
    {
      onSuccess: () => {
        toast.success('Movimiento registrado');
        onClose();
      },
      onError: notifyError,
    },
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Movimiento de efectivo"
        description="Retiros parciales o ingresos de base adicional."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={amount <= 0 || description.trim().length < 3 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Registrar
            </Button>
          </>
        }
      >
        <div className="flex gap-2">
          <Chip
            active={type === CashMovementType.WITHDRAWAL}
            onClick={() => {
              setType(CashMovementType.WITHDRAWAL);
            }}
          >
            Retiro
          </Chip>
          <Chip
            active={type === CashMovementType.INCOME}
            onClick={() => {
              setType(CashMovementType.INCOME);
            }}
          >
            Ingreso
          </Chip>
        </div>
        <Field label="Monto">
          {(id) => <MoneyInput id={id} value={amount} onValueChange={setAmount} />}
        </Field>
        <Field label="Descripción">
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseDialog({
  hasOpenSession,
  onClose,
}: {
  hasOpenSession: boolean;
  onClose: () => void;
}) {
  const api = useApi();
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [fromCash, setFromCash] = useState(hasOpenSession);
  const [reference, setReference] = useState('');
  const save = useApiMutation(
    () =>
      api.cash.createExpense({
        category,
        description: description.trim(),
        amount,
        paymentMethod: method,
        paidFromCash: method === PaymentMethod.CASH && fromCash,
        reference: reference.trim() || null,
      }),
    [queryKeys.cash, queryKeys.expenses, queryKeys.reports],
    {
      onSuccess: () => {
        toast.success('Gasto registrado');
        onClose();
      },
      onError: notifyError,
    },
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Registrar gasto"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={amount <= 0 || description.trim().length < 3 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar gasto
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                }}
              >
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Monto">
            {(id) => <MoneyInput id={id} value={amount} onValueChange={setAmount} />}
          </Field>
        </div>
        <Field label="Descripción">
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagado con">
            {(id) => (
              <Select
                id={id}
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as PaymentMethod);
                }}
              >
                {Object.values(PaymentMethod).map((option) => (
                  <option key={option} value={option}>
                    {PAYMENT_METHOD_LABEL[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Referencia / factura">
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
        </div>
        {method === PaymentMethod.CASH && hasOpenSession ? (
          <Switch
            checked={fromCash}
            onCheckedChange={setFromCash}
            label="Salió del efectivo de la caja abierta"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
