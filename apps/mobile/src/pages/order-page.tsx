import {
  useApi,
  useHasPermission,
  useMoney,
  useOrder,
  useOrderAccess,
  useOrderMutation,
  useTerminology,
} from '@karbon/client';
import { type OrderItemDto, OrderItemStatus, OrderStatus, Permission } from '@karbon/types';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  notifyError,
  ORDER_STATUS_LABEL,
  Spinner,
  toast,
} from '@karbon/ui';
import { describeOrderDiscount, formatTime, isOrderActive } from '@karbon/utils';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  LockIcon,
  PlusIcon,
  ReceiptTextIcon,
  SendIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ItemSheet, OrderActions } from '../components/order-actions';
import { TicketProgress } from '../components/ticket-progress';

/** Pedido desde el celular: qué se pidió, cómo va en cocina/barra y acciones del mesero. */
export default function OrderPage() {
  const { orderId = '' } = useParams();
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const navigate = useNavigate();
  const order = useOrder(orderId);
  const canSend = useHasPermission(Permission.ORDERS_SEND);
  const canBill = useHasPermission(Permission.ORDERS_REQUEST_BILL);
  const canUpdate = useHasPermission(Permission.ORDERS_UPDATE);
  const canCancel = useHasPermission(Permission.ORDERS_CANCEL);
  const access = useOrderAccess();

  const send = useOrderMutation(orderId, (current) => api.orders.send(orderId, current.version), {
    onSuccess: () => toast.success(`Enviado ${terms.toPrepArea}`),
    onError: notifyError,
  });
  const requestBill = useOrderMutation(
    orderId,
    (current) => api.orders.requestBill(orderId, current.version),
    {
      onSuccess: () => toast.success('Cuenta solicitada a caja'),
      onError: notifyError,
    },
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editing, setEditing] = useState<OrderItemDto | null>(null);

  if (order.isPending) return <Spinner className="self-center p-10" />;
  const data = order.data;
  if (!data) {
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title="Pedido no encontrado"
        action={
          <Button
            onClick={() => {
              void navigate('/');
            }}
          >
            Volver a mesas
          </Button>
        }
      />
    );
  }

  // Cada mesero opera sus pedidos; los de otro los ve, pero no los modifica.
  const owned = access.canManage(data.waiter.id);
  const editable = isOrderActive(data.status) && owned;
  const canTouch = (item: OrderItemDto): boolean =>
    editable &&
    item.status !== OrderItemStatus.CANCELLED &&
    (item.status === OrderItemStatus.PENDING ? canUpdate : canCancel);
  const items = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const pendingCount = items
    .filter((item) => item.status === OrderItemStatus.PENDING)
    .reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-1 flex-col pb-28">
      <div className="flex items-center gap-2 border-b bg-background p-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => {
            void navigate('/');
          }}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">
            {data.tableName ?? data.label ?? `Pedido #${String(data.number)}`}
          </h1>
          <p className="text-xs text-muted-foreground">
            #{data.number} · {data.waiter.name} · abierto {formatTime(data.createdAt)}
            {data.guests ? ` · ${String(data.guests)} pers.` : ''}
          </p>
        </div>
        <Badge variant={data.status === OrderStatus.BILL_REQUESTED ? 'destructive' : 'secondary'}>
          {ORDER_STATUS_LABEL[data.status]}
        </Badge>
        {editable ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Más acciones"
            onClick={() => {
              setActionsOpen(true);
            }}
          >
            <EllipsisVerticalIcon />
          </Button>
        ) : null}
      </div>

      {isOrderActive(data.status) && !owned ? (
        <p className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-sm">
          <LockIcon className="size-4 shrink-0" aria-hidden />
          Lo atiende {data.waiter.name}: puedes verlo, pero no modificarlo.
        </p>
      ) : null}
      {data.notes ? (
        <p className="bg-background px-3 pt-3 text-sm">
          <span className="font-semibold">Nota del pedido:</span> {data.notes}
        </p>
      ) : null}

      <TicketProgress order={data} />

      <ul className="flex flex-col divide-y bg-background">
        {items.map((item) => {
          const pending = item.status === OrderItemStatus.PENDING;
          const cancelled = item.status === OrderItemStatus.CANCELLED;
          const touchable = canTouch(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!touchable}
                onClick={() => {
                  setEditing(item);
                }}
                className={cn(
                  'flex min-h-14 w-full items-start gap-3 px-3 py-2.5 text-left active:bg-accent disabled:active:bg-transparent',
                  pending && 'bg-status-waiting-food/10',
                  cancelled && 'text-muted-foreground line-through',
                )}
              >
                <span className="min-w-7 rounded-md bg-muted px-1.5 py-0.5 text-center text-sm font-bold">
                  {item.quantity}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{item.productName}</span>
                  {item.notes ? (
                    <span className="text-xs text-muted-foreground">· {item.notes}</span>
                  ) : null}
                  {pending ? (
                    <span className="text-[11px] font-semibold text-status-waiting-food">
                      Sin enviar{touchable ? ' · toca para editar' : ''}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(item.total)}</span>
                {touchable ? (
                  <ChevronRightIcon className="size-5 shrink-0 self-center text-muted-foreground" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-y-0.5 border-y bg-background px-3 py-3 text-sm">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right tabular-nums">{money(data.subtotal)}</dd>
        {data.discountTotal > 0 ? (
          <>
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="text-right tabular-nums">−{money(data.discountTotal)}</dd>
          </>
        ) : null}
        {data.orderDiscount ? (
          <p className="col-span-2 text-xs text-primary">
            Caja aplicó {describeOrderDiscount(data.orderDiscount, money)} ·{' '}
            {data.orderDiscount.reason}
          </p>
        ) : null}
        <dt className="text-muted-foreground">Impuestos</dt>
        <dd className="text-right tabular-nums">{money(data.taxTotal)}</dd>
        {data.tipAmount > 0 ? (
          <>
            <dt className="text-muted-foreground">Propina sugerida</dt>
            <dd className="text-right tabular-nums">{money(data.tipAmount)}</dd>
          </>
        ) : null}
        <dt className="text-base font-bold">Total</dt>
        <dd className="text-right text-base font-bold tabular-nums">{money(data.total)}</dd>
      </dl>

      {editable ? (
        <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t bg-background p-3 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] [@media(max-height:500px)]:grid-flow-col [@media(max-height:500px)]:grid-cols-none [@media(max-height:500px)]:py-2">
          {pendingCount > 0 && canSend ? (
            <Button
              size="touch"
              // Celular horizontal: las tres acciones en una fila para no tapar el pedido.
              className="col-span-2 [@media(max-height:500px)]:col-span-1 [@media(max-height:500px)]:h-12"
              disabled={send.isPending}
              onClick={() => {
                send.mutate();
              }}
            >
              <SendIcon /> {terms.sendAction} ({pendingCount})
            </Button>
          ) : null}
          <Button
            size="lg"
            variant={pendingCount > 0 ? 'outline' : 'default'}
            onClick={() => {
              void navigate(`/pedido/${orderId}/agregar`);
            }}
          >
            <PlusIcon /> Agregar
          </Button>
          {canBill ? (
            <Button
              size="lg"
              variant="outline"
              disabled={
                data.status === OrderStatus.BILL_REQUESTED ||
                pendingCount > 0 ||
                requestBill.isPending
              }
              onClick={() => {
                requestBill.mutate();
              }}
            >
              <HandCoinsIcon /> Pedir cuenta
            </Button>
          ) : null}
        </div>
      ) : null}

      {actionsOpen ? (
        <OrderActions
          order={data}
          onClose={() => {
            setActionsOpen(false);
          }}
        />
      ) : null}
      {editing ? (
        <ItemSheet
          order={data}
          item={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
