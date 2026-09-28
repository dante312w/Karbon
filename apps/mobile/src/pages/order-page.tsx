import {
  useApi,
  useHasPermission,
  useMoney,
  useOrder,
  useOrderMutation,
  useTerminology,
} from '@karbon/client';
import { KitchenTicketStatus, OrderItemStatus, OrderStatus, Permission } from '@karbon/types';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  KITCHEN_TICKET_STATUS_LABEL,
  notifyError,
  ORDER_STATUS_LABEL,
  Spinner,
  toast,
} from '@karbon/ui';
import { isOrderActive, STATION_LABEL } from '@karbon/utils';
import {
  ArrowLeftIcon,
  HandCoinsIcon,
  PlusIcon,
  ReceiptTextIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

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
  const removePending = useOrderMutation(
    orderId,
    (current, itemId: string) =>
      api.orders.cancelItem(orderId, itemId, { version: current.version }),
    { onError: notifyError },
  );

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

  const editable = isOrderActive(data.status);
  const items = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const pendingCount = items
    .filter((item) => item.status === OrderItemStatus.PENDING)
    .reduce((sum, item) => sum + item.quantity, 0);
  const tickets = data.tickets.filter((ticket) => ticket.status !== KitchenTicketStatus.CANCELLED);

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
            #{data.number} · {data.waiter.name}
            {data.guests ? ` · ${String(data.guests)} pers.` : ''}
          </p>
        </div>
        <Badge variant={data.status === OrderStatus.BILL_REQUESTED ? 'destructive' : 'secondary'}>
          {ORDER_STATUS_LABEL[data.status]}
        </Badge>
      </div>

      {tickets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 bg-background px-3 pb-3">
          {tickets.map((ticket) => (
            <span
              key={ticket.id}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                ticket.status === KitchenTicketStatus.READY
                  ? 'bg-primary text-primary-foreground'
                  : ticket.status === KitchenTicketStatus.DELIVERED
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-status-waiting-food/20',
              )}
            >
              Ronda {ticket.sequence}
              {terms.mode === 'BAR' ? '' : ` · ${STATION_LABEL[ticket.station]}`} ·{' '}
              {KITCHEN_TICKET_STATUS_LABEL[ticket.status]}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="flex flex-col divide-y bg-background">
        {items.map((item) => {
          const pending = item.status === OrderItemStatus.PENDING;
          const cancelled = item.status === OrderItemStatus.CANCELLED;
          return (
            <li
              key={item.id}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5',
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
                    Sin enviar
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-semibold tabular-nums">{money(item.total)}</span>
              {pending && editable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="-my-1 size-8"
                  aria-label={`Quitar ${item.productName}`}
                  onClick={() => {
                    removePending.mutate(item.id);
                  }}
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-y-0.5 border-y bg-background px-3 py-3 text-sm">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right tabular-nums">{money(data.subtotal)}</dd>
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
        <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {pendingCount > 0 && canSend ? (
            <Button
              size="touch"
              className="col-span-2"
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
    </div>
  );
}
