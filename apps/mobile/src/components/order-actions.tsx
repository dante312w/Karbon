import {
  queryKeys,
  useApi,
  useApiMutation,
  useHasPermission,
  useMoney,
  useOrderMutation,
  useProductNoteSuggestions,
  useSession,
  useTables,
  useTerminology,
} from '@karbon/client';
import {
  OrderItemStatus,
  type OrderDto,
  type OrderItemDto,
  Permission,
  type TableDto,
} from '@karbon/types';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  NotesEditor,
  notifyError,
  QuantityStepper,
  Textarea,
  toast,
} from '@karbon/ui';
import { freeTables, mergeCandidates, mergedChildren } from '@karbon/utils';
import {
  ArrowRightLeftIcon,
  BanIcon,
  ConciergeBellIcon,
  Link2Icon,
  Link2OffIcon,
  type LucideIcon,
  PencilIcon,
  SplitIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { CallCashierDialog } from './call-cashier-dialog';

type View = 'menu' | 'details' | 'move' | 'merge' | 'unmerge' | 'split' | 'cancel' | 'call';

function Sheet({
  title,
  description,
  footer,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent variant="side" title={title} description={description} footer={footer}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function MenuButton({
  icon: Icon,
  label,
  hint,
  destructive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="touch"
      className={cn(
        'h-auto min-h-14 justify-start py-3 text-left',
        destructive && 'text-destructive',
      )}
      onClick={onClick}
    >
      <Icon className="size-5!" />
      <span className="flex flex-col whitespace-normal">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
    </Button>
  );
}

/**
 * Operaciones del mesero sobre su pedido y su mesa. Cada opción aparece solo si el servidor la
 * aceptaría (permiso y propiedad); el servidor lo vuelve a validar igual.
 */
export function OrderActions({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const [view, setView] = useState<View>('menu');
  const tables = useTables().data ?? [];
  const can = {
    update: useHasPermission(Permission.ORDERS_UPDATE),
    operate: useHasPermission(Permission.TABLES_OPERATE),
    cancel: useHasPermission(Permission.ORDERS_CANCEL),
    callCashier: useHasPermission(Permission.CALLS_CASHIER),
  };
  const table = tables.find((candidate) => candidate.id === order.tableId) ?? null;
  const children = table ? mergedChildren(table, tables) : [];
  const units = order.items
    .filter((item) => item.status !== OrderItemStatus.CANCELLED)
    .reduce((sum, item) => sum + item.quantity, 0);
  const back = (): void => {
    setView('menu');
  };

  switch (view) {
    case 'details':
      return <DetailsSheet order={order} onClose={onClose} />;
    case 'move':
      return <MoveSheet order={order} tables={tables} onClose={onClose} />;
    case 'merge':
      return table ? <MergeSheet main={table} tables={tables} onClose={onClose} /> : null;
    case 'unmerge':
      return table ? (
        <UnmergeSheet
          main={table}
          names={children.map((c) => c.name)}
          onClose={onClose}
          onBack={back}
        />
      ) : null;
    case 'split':
      return <SplitSheet order={order} onClose={onClose} />;
    case 'cancel':
      return <CancelSheet order={order} onClose={onClose} onBack={back} />;
    case 'call':
      return (
        <CallCashierDialog
          orderId={order.id}
          description={order.tableName ?? `Pedido #${String(order.number)}`}
          onClose={onClose}
        />
      );
    case 'menu':
      return (
        <Sheet
          title="Acciones del pedido"
          description={`#${String(order.number)}`}
          onClose={onClose}
        >
          {can.callCashier ? (
            <MenuButton
              icon={ConciergeBellIcon}
              label="Llamar a caja"
              hint="Para cobrar la mesa o pedir ayuda con la cuenta"
              onClick={() => {
                setView('call');
              }}
            />
          ) : null}
          {can.update ? (
            <MenuButton
              icon={PencilIcon}
              label="Detalles del pedido"
              hint="Personas y notas para todo el pedido"
              onClick={() => {
                setView('details');
              }}
            />
          ) : null}
          {can.operate ? (
            <MenuButton
              icon={ArrowRightLeftIcon}
              label="Mover a otra mesa"
              hint="El pedido pasa completo a una mesa libre"
              onClick={() => {
                setView('move');
              }}
            />
          ) : null}
          {can.operate && table ? (
            <MenuButton
              icon={Link2Icon}
              label="Unir mesas"
              hint={`Otras mesas se suman a ${table.name}; sus cuentas quedan separadas`}
              onClick={() => {
                setView('merge');
              }}
            />
          ) : null}
          {can.operate && children.length > 0 ? (
            <MenuButton
              icon={Link2OffIcon}
              label="Separar mesas"
              hint={`Libera ${children.map((child) => child.name).join(', ')}`}
              onClick={() => {
                setView('unmerge');
              }}
            />
          ) : null}
          {can.update && units > 1 && order.paidAmount === 0 ? (
            <MenuButton
              icon={SplitIcon}
              label="Dividir cuenta"
              hint="Algunos productos pasan a una cuenta aparte"
              onClick={() => {
                setView('split');
              }}
            />
          ) : null}
          {can.cancel && order.paidAmount === 0 ? (
            <MenuButton
              icon={BanIcon}
              label="Cancelar pedido"
              hint="Anula todo lo pedido; queda en la auditoría"
              destructive
              onClick={() => {
                setView('cancel');
              }}
            />
          ) : null}
        </Sheet>
      );
  }
}

function DetailsSheet({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const api = useApi();
  const [guests, setGuests] = useState(order.guests ?? 1);
  const [label, setLabel] = useState(order.label ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const save = useOrderMutation(
    order.id,
    (current) =>
      api.orders.update(order.id, {
        version: current.version,
        guests,
        ...(order.tableId ? {} : { label: label.trim() || null }),
        notes: notes.trim() || null,
      }),
    {
      onSuccess: () => {
        toast.success('Pedido actualizado');
        onClose();
      },
      onError: notifyError,
    },
  );
  return (
    <Sheet
      title="Detalles del pedido"
      onClose={onClose}
      footer={
        <Button
          size="touch"
          className="w-full"
          disabled={save.isPending || (!order.tableId && !label.trim())}
          onClick={() => {
            save.mutate();
          }}
        >
          Guardar
        </Button>
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">Personas</span>
        <QuantityStepper value={guests} onChange={setGuests} max={99} />
      </div>
      {order.tableId ? null : (
        <Field label="Nombre de la cuenta">
          {(id) => (
            <Input
              id={id}
              className="h-12"
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
            maxLength={300}
            placeholder="Ej. cumpleaños, traer todo junto"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        )}
      </Field>
    </Sheet>
  );
}

function TableGrid({
  tables,
  selected,
  disabled,
  onToggle,
}: {
  tables: readonly TableDto[];
  selected: readonly string[];
  disabled: boolean;
  onToggle: (table: TableDto) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tables.map((table) => {
        const checked = selected.includes(table.id);
        return (
          <Button
            key={table.id}
            variant={checked ? 'default' : 'outline'}
            size="touch"
            className="h-auto min-h-14 flex-col gap-0 px-2 py-2"
            aria-pressed={checked}
            disabled={disabled}
            onClick={() => {
              onToggle(table);
            }}
          >
            <span className="whitespace-normal">{table.name}</span>
            {table.activeOrders.length > 0 ? (
              <span className="text-xs font-normal opacity-80">ocupada</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

function MoveSheet({
  order,
  tables,
  onClose,
}: {
  order: OrderDto;
  tables: readonly TableDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const free = freeTables(tables, order.tableId);
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
    <Sheet title="Mover a otra mesa" description="Toca la mesa libre de destino" onClose={onClose}>
      <TableGrid
        tables={free}
        selected={[]}
        disabled={move.isPending}
        onToggle={(table) => {
          move.mutate(table.id);
        }}
      />
      {free.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay mesas libres.</p>
      ) : null}
    </Sheet>
  );
}

function MergeSheet({
  main,
  tables,
  onClose,
}: {
  main: TableDto;
  tables: readonly TableDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const session = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = session ? mergeCandidates(main, tables, session.user) : [];
  const merge = useApiMutation(
    () => api.floor.merge(main.id, { tableIds: selected }),
    [queryKeys.tables, queryKeys.activeOrders],
    {
      onSuccess: () => {
        toast.success(`Mesas unidas a ${main.name}`);
        onClose();
      },
      onError: notifyError,
    },
  );
  return (
    <Sheet
      title={`Unir a ${main.name}`}
      description="Las cuentas de las mesas que elijas pasan a esta mesa, cada una por separado."
      onClose={onClose}
      footer={
        <Button
          size="touch"
          className="w-full"
          disabled={selected.length === 0 || merge.isPending}
          onClick={() => {
            merge.mutate(undefined);
          }}
        >
          <Link2Icon /> Unir {selected.length > 0 ? `(${String(selected.length)})` : ''}
        </Button>
      }
    >
      <TableGrid
        tables={candidates}
        selected={selected}
        disabled={merge.isPending}
        onToggle={(table) => {
          setSelected(
            selected.includes(table.id)
              ? selected.filter((id) => id !== table.id)
              : [...selected, table.id],
          );
        }}
      />
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay mesas que puedas unir en esta área (las de otro mesero no aparecen).
        </p>
      ) : null}
    </Sheet>
  );
}

function UnmergeSheet({
  main,
  names,
  onClose,
  onBack,
}: {
  main: TableDto;
  names: readonly string[];
  onClose: () => void;
  onBack: () => void;
}) {
  const api = useApi();
  const unmerge = useApiMutation(
    () => api.floor.unmerge(main.id),
    [queryKeys.tables, queryKeys.activeOrders],
    {
      onSuccess: () => {
        toast.success('Mesas separadas');
        onClose();
      },
      onError: notifyError,
    },
  );
  return (
    <Sheet
      title="Separar mesas"
      description={`${names.join(', ')} quedan libres. Las cuentas siguen en ${main.name}; si alguna era de otra mesa, muévela después.`}
      onClose={onClose}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="touch" onClick={onBack}>
            Volver
          </Button>
          <Button
            size="touch"
            disabled={unmerge.isPending}
            onClick={() => {
              unmerge.mutate(undefined);
            }}
          >
            <Link2OffIcon /> Separar
          </Button>
        </div>
      }
    >
      {null}
    </Sheet>
  );
}

function SplitSheet({ order, onClose }: { order: OrderDto; onClose: () => void }) {
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
        toast.success(`Cuenta dividida: nuevo pedido #${String(created.number)}`);
        onClose();
        void navigate(`/pedido/${created.id}`);
      },
      onError: notifyError,
    },
  );
  return (
    <Sheet
      title="Dividir cuenta"
      description="Lo que elijas pasa a una cuenta nueva en la misma mesa"
      onClose={onClose}
      footer={
        <Button
          size="touch"
          className="w-full"
          disabled={chosen.length === 0 || split.isPending}
          onClick={() => {
            split.mutate();
          }}
        >
          <SplitIcon /> Separar {chosenTotal > 0 ? money(chosenTotal) : ''}
        </Button>
      }
    >
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{item.productName}</p>
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
    </Sheet>
  );
}

function CancelSheet({
  order,
  onClose,
  onBack,
}: {
  order: OrderDto;
  onClose: () => void;
  onBack: () => void;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const cancel = useOrderMutation(
    order.id,
    (current) => api.orders.cancel(order.id, { version: current.version, reason: reason.trim() }),
    {
      onSuccess: () => {
        toast.success('Pedido cancelado');
        onClose();
        void navigate('/');
      },
      onError: notifyError,
    },
  );
  return (
    <Sheet
      title={`Cancelar pedido #${String(order.number)}`}
      description="Se anula todo lo pedido y se avisa a cocina. No se puede deshacer."
      onClose={onClose}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="touch" onClick={onBack}>
            Volver
          </Button>
          <Button
            variant="destructive"
            size="touch"
            disabled={reason.trim().length < 3 || cancel.isPending}
            onClick={() => {
              cancel.mutate();
            }}
          >
            <BanIcon /> Cancelar pedido
          </Button>
        </div>
      }
    >
      <ReasonField value={reason} onChange={setReason} />
    </Sheet>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Motivo (obligatorio)">
      {(id) => (
        <Textarea
          id={id}
          maxLength={255}
          placeholder="Ej. el cliente se retiró"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}

/**
 * Un producto del pedido: si aún no se envía, se cambia la cantidad o la nota, o se quita; si ya
 * se envió, solo se anula con motivo (y con permiso), porque cocina ya lo tiene.
 */
export function ItemSheet({
  order,
  item,
  onClose,
}: {
  order: OrderDto;
  item: OrderItemDto;
  onClose: () => void;
}) {
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const noteSuggestions = useProductNoteSuggestions(item.productId);
  const canCancel = useHasPermission(Permission.ORDERS_CANCEL);
  const pending = item.status === OrderItemStatus.PENDING;
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [reason, setReason] = useState('');

  const save = useOrderMutation(
    order.id,
    (current) =>
      api.orders.updateItem(order.id, item.id, {
        version: current.version,
        quantity,
        notes: notes.trim() || null,
      }),
    { onSuccess: onClose, onError: notifyError },
  );
  const remove = useOrderMutation(
    order.id,
    (current) =>
      api.orders.cancelItem(order.id, item.id, {
        version: current.version,
        ...(pending ? {} : { reason: reason.trim() }),
      }),
    {
      onSuccess: () => {
        toast.success(pending ? 'Producto quitado' : 'Producto anulado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const busy = save.isPending || remove.isPending;

  if (!pending) {
    return (
      <Sheet
        title={item.productName}
        description={`${String(item.quantity)} × ${money(item.unitPrice)} · ya se envió ${terms.toPrepArea}`}
        onClose={onClose}
        footer={
          canCancel ? (
            <Button
              variant="destructive"
              size="touch"
              className="w-full"
              disabled={reason.trim().length < 3 || busy}
              onClick={() => {
                remove.mutate();
              }}
            >
              <BanIcon /> Anular producto
            </Button>
          ) : undefined
        }
      >
        {canCancel ? (
          <ReasonField value={reason} onChange={setReason} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ya está {terms.inPrepArea}. Para anularlo pide ayuda a caja.
          </p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      title={item.productName}
      description={`${money(item.unitPrice)} c/u · sin enviar`}
      onClose={onClose}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="touch"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              remove.mutate();
            }}
          >
            Quitar
          </Button>
          <Button
            size="touch"
            disabled={busy}
            onClick={() => {
              save.mutate();
            }}
          >
            Guardar · {money(item.unitPrice * quantity)}
          </Button>
        </div>
      }
    >
      <QuantityStepper value={quantity} onChange={setQuantity} className="self-center" />
      <NotesEditor value={notes} onChange={setNotes} suggestions={noteSuggestions} />
    </Sheet>
  );
}
