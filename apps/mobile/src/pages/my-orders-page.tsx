import {
  queryKeys,
  useActiveOrders,
  useApi,
  useApiMutation,
  useMoney,
  useSession,
} from '@karbon/client';
import { KitchenTicketStatus, type OrderDto, OrderItemStatus, OrderStatus } from '@karbon/types';
import {
  Badge,
  Button,
  EmptyState,
  notifyError,
  ORDER_STATUS_LABEL,
  Spinner,
  toast,
  useNow,
} from '@karbon/ui';
import { elapsedLabel, formatTime, summarizePreparation } from '@karbon/utils';
import { HandPlatterIcon, ReceiptTextIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PrepStatus } from '../components/prep-status';
import { vibrate } from '../lib/haptics';

/** Pedidos abiertos del mesero: qué recoger ya, qué lleva mucho en cocina y cuánto van. */
export default function MyOrdersPage() {
  const api = useApi();
  const orders = useActiveOrders();
  const session = useSession();
  const money = useMoney();
  const mine = (orders.data?.items ?? [])
    .filter((order) => order.waiter.id === session?.user.id)
    // Lo que hay que llevar a la mesa va primero.
    .sort(
      (a, b) =>
        summarizePreparation(b.tickets).readyTickets -
          summarizePreparation(a.tickets).readyTickets || a.createdAt.localeCompare(b.createdAt),
    );
  const running = mine.some((order) => summarizePreparation(order.tickets).preparingSince);
  const now = useNow(running ? 1_000 : 30_000);

  const deliverReady = useApiMutation(
    async (order: OrderDto) => {
      const ready = order.tickets.filter((ticket) => ticket.status === KitchenTicketStatus.READY);
      for (const ticket of ready) await api.orders.deliverTicket(order.id, ticket.id);
      return order;
    },
    [queryKeys.activeOrders, queryKeys.tables],
    {
      onSuccess: (order) => {
        vibrate(20);
        toast.success(
          `${order.tableName ?? order.label ?? `Pedido #${String(order.number)}`}: entregado`,
        );
      },
      onError: notifyError,
    },
  );

  if (orders.isPending) return <Spinner className="self-center p-10" />;
  if (mine.length === 0)
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title="No tienes pedidos abiertos"
        description="Abre una mesa desde la pestaña Mesas."
      />
    );

  return (
    <ul className="mx-auto grid w-full max-w-7xl gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
      {mine.map((order) => {
        const summary = summarizePreparation(order.tickets);
        const units = order.items
          .filter((item) => item.status !== OrderItemStatus.CANCELLED)
          .reduce((sum, item) => sum + item.quantity, 0);
        const unsent = order.items.filter((item) => item.status === OrderItemStatus.PENDING).length;
        const delivering = deliverReady.isPending && deliverReady.variables.id === order.id;
        return (
          <li key={order.id} className="flex flex-col rounded-2xl border bg-card shadow-soft">
            <Link to={`/pedido/${order.id}`} className="flex flex-col gap-2 p-3 active:opacity-70">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">
                    {order.tableName ?? order.label ?? `Pedido #${String(order.number)}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    #{order.number} · abierto {formatTime(order.createdAt)} (
                    {elapsedLabel(order.createdAt, now)}) · {units}{' '}
                    {units === 1 ? 'producto' : 'productos'}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(order.total)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {order.status === OrderStatus.BILL_REQUESTED ? (
                  <Badge variant="destructive">{ORDER_STATUS_LABEL[order.status]}</Badge>
                ) : null}
                {unsent > 0 ? <Badge variant="outline">{unsent} sin enviar</Badge> : null}
              </span>
              <PrepStatus summary={summary} now={now} />
            </Link>
            {summary.readyTickets > 0 ? (
              <div className="border-t p-2">
                <Button
                  size="touch"
                  className="w-full"
                  disabled={delivering}
                  onClick={() => {
                    deliverReady.mutate(order);
                  }}
                >
                  <HandPlatterIcon /> Entregado en la mesa
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
