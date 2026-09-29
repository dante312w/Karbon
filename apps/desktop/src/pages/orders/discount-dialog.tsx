import { useApi, useMoney, useOrderMutation, useSettings } from '@karbon/client';
import { DiscountType, type OrderDto, OrderItemStatus } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  toast,
} from '@karbon/ui';
import {
  calculateOrderTotals,
  exceedsDiscountLimit,
  type OrderDiscountRule,
  practicalUnit,
} from '@karbon/utils';
import { useState } from 'react';
import { MoneyInput } from '../../components/money-input';

const REASONS = ['Cortesía', 'Cliente frecuente', 'Demora en el servicio', 'Error en el pedido'];

/**
 * Descuento sobre el total (caja). La vista previa usa la misma función que el servidor; el
 * servidor vuelve a validar el máximo configurado y que no quede por debajo de lo pagado.
 */
export function DiscountDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const money = useMoney();
  const settings = useSettings().data;
  const current = order.orderDiscount;
  const [type, setType] = useState<DiscountType>(current?.type ?? DiscountType.PERCENT);
  const [percent, setPercent] = useState(
    current?.type === DiscountType.PERCENT ? String(current.value) : '',
  );
  const [amount, setAmount] = useState(current?.type === DiscountType.AMOUNT ? current.value : 0);
  const [reason, setReason] = useState(current?.reason ?? '');

  const value = type === DiscountType.PERCENT ? Number(percent.replace(',', '.')) : amount;
  const validValue =
    type === DiscountType.PERCENT
      ? Number.isFinite(value) &&
        value > 0 &&
        value <= 100 &&
        Math.round(value * 100) === value * 100
      : value > 0;
  const rule: OrderDiscountRule | null = validValue ? { type, value } : null;
  const currency = settings?.currency ?? 'COP';
  const preview = calculateOrderTotals(
    order.items
      .filter((item) => item.status !== OrderItemStatus.CANCELLED)
      .map((item) => ({
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        taxRate: item.taxRate,
        discount: item.discount,
      })),
    {
      pricesIncludeTax: settings?.pricesIncludeTax ?? true,
      tipPercent: order.tipPercent,
      tipRoundingUnit: practicalUnit(currency),
      orderDiscount: rule,
    },
  );
  const maxPercent = settings?.maxDiscountPercent ?? 100;
  const overLimit = rule !== null && exceedsDiscountLimit(preview, maxPercent);
  const belowPaid = rule !== null && preview.total < order.paidAmount;
  const canApply = rule !== null && reason.trim().length >= 3 && !overLimit && !belowPaid;

  const save = useOrderMutation(
    order.id,
    (latest) =>
      api.orders.setDiscount(order.id, {
        version: latest.version,
        discount: rule ? { type: rule.type, value: rule.value, reason: reason.trim() } : null,
      }),
    {
      onSuccess: () => {
        toast.success('Descuento aplicado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useOrderMutation(
    order.id,
    (latest) => api.orders.setDiscount(order.id, { version: latest.version, discount: null }),
    {
      onSuccess: () => {
        toast.success('Descuento quitado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const busy = save.isPending || remove.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Descuento al pedido"
        description={
          maxPercent < 100
            ? `Máximo permitido: ${String(maxPercent)} % de la cuenta (con los descuentos por producto).`
            : 'Se reparte entre los productos para calcular bien los impuestos.'
        }
        footer={
          <>
            {current ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={busy}
                onClick={() => {
                  remove.mutate();
                }}
              >
                Quitar descuento
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="lg"
              disabled={!canApply || busy}
              onClick={() => {
                save.mutate();
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de descuento">
          {[
            { value: DiscountType.PERCENT, label: 'Porcentaje (%)' },
            { value: DiscountType.AMOUNT, label: 'Valor fijo ($)' },
          ].map((option) => (
            <Button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              variant={type === option.value ? 'default' : 'outline'}
              onClick={() => {
                setType(option.value);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {type === DiscountType.PERCENT ? (
          <Field label="Porcentaje" hint="Hasta 2 decimales">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                autoFocus
                placeholder="10"
                value={percent}
                onChange={(event) => {
                  setPercent(event.target.value);
                }}
              />
            )}
          </Field>
        ) : (
          <Field label="Valor a descontar">
            {(id) => <MoneyInput id={id} autoFocus value={amount} onValueChange={setAmount} />}
          </Field>
        )}
        <Field label="Motivo" hint="Queda en la auditoría con quién lo aplicó">
          {(id) => (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {REASONS.map((option) => (
                  <Chip
                    key={option}
                    active={reason === option}
                    onClick={() => {
                      setReason(option);
                    }}
                  >
                    {option}
                  </Chip>
                ))}
              </div>
              <Input
                id={id}
                maxLength={255}
                placeholder="Otro motivo"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </div>
          )}
        </Field>
        <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-muted p-3 text-sm">
          <dt className="text-muted-foreground">Total actual</dt>
          <dd className="text-right tabular-nums">{money(order.total)}</dd>
          <dt className="text-muted-foreground">Descuento</dt>
          <dd className="text-right tabular-nums">−{money(preview.orderDiscountAmount)}</dd>
          <dt className="font-semibold">Total con descuento</dt>
          <dd className="text-right font-semibold tabular-nums">{money(preview.total)}</dd>
        </dl>
        {overLimit || belowPaid ? (
          <p className={cn('rounded-lg bg-destructive/10 p-2 text-sm text-destructive')}>
            {overLimit
              ? `Supera el máximo permitido (${String(maxPercent)} % de la cuenta).`
              : `Ya se pagaron ${money(order.paidAmount)}: el total no puede quedar por debajo.`}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
