import { useApi, useApiMutation, useMoney, useOrderMutation, useTables } from '@karbon/client';
import { OrderItemStatus, type OrderDto } from '@karbon/types';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  QuantityStepper,
  Textarea,
  toast,
} from '@karbon/ui';
import { freeTables } from '@karbon/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CustomerPicker } from '../../components/customer-picker';

function useFreeTables(excludeId: string | null) {
  return freeTables(useTables().data ?? [], excludeId);
}

export function MoveOrderDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const tables = useFreeTables(order.tableId);
  const move = useOrderMutation(
    order.id,
    (current, tableId: string) => api.orders.move(order.id, { version: current.version, tableId }),
    {
      onSuccess: (moved) => {
        toast.success(`Pedido movido a ${moved.tableName ?? 'la mesa'}`);
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
      <DialogContent title="Mover a otra mesa" description="Solo se muestran mesas libres">
        <div className="grid grid-cols-4 gap-2">
          {tables.map((table) => (
            <Button
              key={table.id}
              variant="outline"
              size="lg"
              disabled={move.isPending}
              onClick={() => {
                move.mutate(table.id);
              }}
            >
              {table.name}
            </Button>
          ))}
        </div>
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay mesas libres.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Dividir la cuenta por productos: lo elegido pasa a una cuenta nueva de la misma mesa. */
export function SplitOrderDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const money = useMoney();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<Record<string, number>>({});
  const items = order.items.filter((item) => item.status !== OrderItemStatus.CANCELLED);
  const chosen = Object.entries(selection).filter(([, quantity]) => quantity > 0);
  const chosenTotal = chosen.reduce((sum, [itemId, quantity]) => {
    const item = items.find((candidate) => candidate.id === itemId);
    return item ? sum + Math.round((item.total / item.quantity) * quantity) : sum;
  }, 0);

  const split = useOrderMutation(
    order.id,
    (current) =>
      api.orders.split(order.id, {
        version: current.version,
        items: chosen.map(([itemId, quantity]) => ({ itemId, quantity })),
      }),
    {
      onSuccess: (created) => {
        toast.success(`Cuenta dividida: nuevo pedido #${created.number}`);
        onClose();
        void navigate(`/pedidos/${created.id}`);
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
        title="Dividir cuenta"
        description="Elige qué productos pasan a una cuenta separada"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={chosen.length === 0 || split.isPending}
              onClick={() => {
                split.mutate();
              }}
            >
              Separar {chosenTotal > 0 ? money(chosenTotal) : ''}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} en la cuenta · {money(item.total)}
                </p>
              </div>
              <QuantityStepper
                min={0}
                max={item.quantity}
                value={selection[item.id] ?? 0}
                onChange={(quantity) => {
                  setSelection({ ...selection, [item.id]: quantity });
                }}
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Repetir un pedido (mismo consumo) en otra mesa o como cuenta sin mesa. */
export function DuplicateOrderDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const tables = useFreeTables(null);
  const [label, setLabel] = useState('');
  const duplicate = useApiMutation(
    (target: { tableId: string } | { label: string }) => api.orders.duplicate(order.id, target),
    [],
    {
      onSuccess: (created) => {
        toast.success(`Pedido #${created.number} creado`);
        onClose();
        void navigate(`/pedidos/${created.id}`);
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
        title="Duplicar pedido"
        description="Se crea un pedido nuevo con los mismos productos, sin enviar"
      >
        <Field label="Como cuenta sin mesa">
          {(id) => (
            <div className="flex gap-2">
              <Input
                id={id}
                placeholder="Nombre de la cuenta"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
              <Button
                disabled={duplicate.isPending || !label.trim()}
                onClick={() => {
                  duplicate.mutate({ label: label.trim() });
                }}
              >
                Crear
              </Button>
            </div>
          )}
        </Field>
        <span className="text-sm font-medium">O en una mesa libre</span>
        <div className="grid grid-cols-4 gap-2">
          {tables.map((table) => (
            <Button
              key={table.id}
              variant="outline"
              size="lg"
              disabled={duplicate.isPending}
              onClick={() => {
                duplicate.mutate({ tableId: table.id });
              }}
            >
              {table.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Comensales, nombre de la cuenta, notas generales y cliente del pedido. */
export function OrderDetailsDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const [guests, setGuests] = useState(order.guests ?? 1);
  const [label, setLabel] = useState(order.label ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    order.customerId && order.customerName
      ? { id: order.customerId, name: order.customerName }
      : null,
  );
  const save = useOrderMutation(
    order.id,
    (current) =>
      api.orders.update(order.id, {
        version: current.version,
        guests,
        label: label.trim() || null,
        notes: notes.trim() || null,
        customerId: customer?.id ?? null,
      }),
    { onSuccess: onClose, onError: notifyError },
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={`Pedido #${order.number}`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => {
                save.mutate();
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Personas</span>
          <QuantityStepper value={guests} onChange={setGuests} max={99} />
        </div>
        {order.tableId ? null : (
          <Field label="Nombre de la cuenta">
            {(id) => (
              <Input
                id={id}
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
            )}
          </Field>
        )}
        <Field label="Notas del pedido">
          {(id) => (
            <Textarea
              id={id}
              value={notes}
              maxLength={300}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Cliente">
          {() => <CustomerPicker value={customer} onChange={setCustomer} />}
        </Field>
      </DialogContent>
    </Dialog>
  );
}
