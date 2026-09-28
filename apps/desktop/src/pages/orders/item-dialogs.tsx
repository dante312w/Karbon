import {
  useApi,
  useHasPermission,
  useMoney,
  useOrderMutation,
  useTerminology,
} from '@karbon/client';
import { OrderItemStatus, Permission, type OrderItemDto } from '@karbon/types';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  NotesEditor,
  notifyError,
  QuantityStepper,
  Textarea,
} from '@karbon/ui';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { MoneyInput } from '../../components/money-input';

/**
 * Edición de una línea: cantidad y nota mientras no se haya enviado; descuento (con permiso),
 * duplicar, mover en la lista y quitar/anular (anular lo enviado exige permiso y motivo).
 */
export function ItemEditorDialog({
  orderId,
  item,
  items,
  onClose,
}: {
  orderId: string;
  item: OrderItemDto;
  items: OrderItemDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const canDiscount = useHasPermission(Permission.ORDERS_DISCOUNT);
  const canCancel = useHasPermission(Permission.ORDERS_CANCEL);
  const pending = item.status === OrderItemStatus.PENDING;
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [discount, setDiscount] = useState(item.discount);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const close = { onSuccess: onClose, onError: notifyError };
  const save = useOrderMutation(
    orderId,
    (order) => {
      const contentChanged = quantity !== item.quantity || (notes.trim() || null) !== item.notes;
      return api.orders.updateItem(orderId, item.id, {
        version: order.version,
        ...(pending && contentChanged ? { quantity, notes: notes.trim() || null } : {}),
        ...(discount !== item.discount ? { discount } : {}),
      });
    },
    close,
  );
  const remove = useOrderMutation(
    orderId,
    (order) =>
      api.orders.cancelItem(orderId, item.id, {
        version: order.version,
        ...(pending ? {} : { reason: reason.trim() }),
      }),
    close,
  );
  const duplicate = useOrderMutation(
    orderId,
    (order) => api.orders.duplicateItem(orderId, item.id, { version: order.version }),
    close,
  );
  const move = useOrderMutation(
    orderId,
    (order, direction: -1 | 1) => {
      const ids = items.map((candidate) => candidate.id);
      const index = ids.indexOf(item.id);
      const target = index + direction;
      const swapped = ids[target];
      if (swapped === undefined) return Promise.resolve(order);
      ids[target] = item.id;
      ids[index] = swapped;
      return api.orders.reorderItems(orderId, { version: order.version, itemIds: ids });
    },
    { onError: notifyError },
  );
  const position = items.findIndex((candidate) => candidate.id === item.id);
  const busy = save.isPending || remove.isPending || duplicate.isPending;
  const lineTotal = item.unitPrice * (pending ? quantity : item.quantity) - discount;

  if (cancelling) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          title={`Anular ${item.productName}`}
          description={`Ya se envió ${terms.toPrepArea}: la anulación queda auditada y se avisa en el tablero.`}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCancelling(false);
                }}
              >
                Volver
              </Button>
              <Button
                variant="destructive"
                disabled={reason.trim().length < 3 || remove.isPending}
                onClick={() => {
                  remove.mutate();
                }}
              >
                Anular producto
              </Button>
            </>
          }
        >
          <Field label="Motivo">
            {(id) => (
              <Textarea
                id={id}
                autoFocus
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            )}
          </Field>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={item.productName}
        description={`${money(item.unitPrice)} c/u · ${pending ? 'sin enviar' : `enviado ${terms.toPrepArea}`}`}
        footer={
          <>
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={busy || (!pending && !canCancel)}
              onClick={() => {
                if (pending) remove.mutate();
                else setCancelling(true);
              }}
            >
              <Trash2Icon /> {pending ? 'Quitar' : 'Anular'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                duplicate.mutate();
              }}
            >
              <CopyIcon /> Duplicar
            </Button>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => {
                save.mutate();
              }}
            >
              Guardar · {money(Math.max(0, lineTotal))}
            </Button>
          </>
        }
      >
        {pending ? (
          <>
            <QuantityStepper value={quantity} onChange={setQuantity} className="self-center" />
            <NotesEditor value={notes} onChange={setNotes} suggestions={terms.quickNotes} />
          </>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm">
            {item.quantity} × {item.productName}
            {item.notes ? ` · ${item.notes}` : ''}. Para cambiarlo, anúlalo y agrégalo de nuevo.
          </p>
        )}
        {canDiscount ? (
          <Field label="Descuento de la línea" hint="Valor total a descontar">
            {(id) => <MoneyInput id={id} value={discount} onValueChange={setDiscount} />}
          </Field>
        ) : null}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Orden en el pedido:
          <Button
            variant="outline"
            size="icon"
            aria-label="Subir"
            disabled={position <= 0 || move.isPending}
            onClick={() => {
              move.mutate(-1);
            }}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Bajar"
            disabled={position === items.length - 1 || move.isPending}
            onClick={() => {
              move.mutate(1);
            }}
          >
            <ArrowDownIcon />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
