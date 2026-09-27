import { useActiveOrders, useMoney, useSession, useTerminology } from '@karbon/client';
import { OrderItemStatus } from '@karbon/types';
import { Badge, EmptyState, ORDER_STATUS_LABEL, Spinner, useNow } from '@karbon/ui';
import { elapsedLabel } from '@karbon/utils';
import { ReceiptTextIcon } from 'lucide-react';
import { Link } from 'react-router';

/** Pedidos abiertos del mesero, con lo que está listo para llevar a la mesa. */
export default function MyOrdersPage() {
  const orders = useActiveOrders();
  const session = useSession();
  const money = useMoney();
  const terms = useTerminology();
  const now = useNow();
  const mine = (orders.data?.items ?? []).filter((order) => order.waiter.id === session?.user.id);

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
    <ul className="flex flex-col gap-2 p-3">
      {mine.map((order) => {
        const ready = order.tickets.filter((ticket) => ticket.status === 'READY').length;
        const preparing = order.tickets.filter(
          (ticket) => ticket.status === 'NEW' || ticket.status === 'PREPARING',
        ).length;
        const pending = order.items.filter(
          (item) => item.status === OrderItemStatus.PENDING,
        ).length;
        return (
          <li key={order.id}>
            <Link
              to={`/pedido/${order.id}`}
              className="flex flex-col gap-1.5 rounded-2xl border bg-card p-3 shadow-soft active:scale-[0.99]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {order.tableName ?? order.label ?? `Pedido #${String(order.number)}`}
                </span>
                <span className="font-semibold tabular-nums">{money(order.total)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                #{order.number} · {elapsedLabel(order.createdAt, now)}
                {order.status === 'BILL_REQUESTED' ? (
                  <Badge variant="destructive">{ORDER_STATUS_LABEL[order.status]}</Badge>
                ) : null}
                {ready > 0 ? <Badge>Listo para llevar ({ready})</Badge> : null}
                {preparing > 0 ? (
                  <Badge variant="secondary">
                    {preparing} {terms.inPrepArea}
                  </Badge>
                ) : null}
                {pending > 0 ? <Badge variant="outline">{pending} sin enviar</Badge> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
