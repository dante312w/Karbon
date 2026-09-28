import { useMoney, useTerminology } from '@karbon/client';
import { type OrderDto, type OrderItemDto, OrderItemStatus } from '@karbon/types';
import { cn, KITCHEN_TICKET_STATUS_LABEL } from '@karbon/ui';
import { isTicketOpen, STATION_LABEL } from '@karbon/utils';
import { ShoppingBasketIcon } from 'lucide-react';

/** Líneas del pedido y totales. Las líneas sin enviar se resaltan hasta mandarlas a preparar. */
export function OrderTicket({
  order,
  editable,
  onSelectItem,
}: {
  order: OrderDto;
  editable: boolean;
  onSelectItem: (item: OrderItemDto) => void;
}) {
  const money = useMoney();
  const terms = useTerminology();
  const items = [...order.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeTickets = order.tickets.filter((ticket) => isTicketOpen(ticket.status));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {activeTickets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          {activeTickets.map((ticket) => (
            <span
              key={ticket.id}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                ticket.status === 'READY'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-status-waiting-food/20 text-foreground',
              )}
            >
              Ronda {ticket.sequence} ·{' '}
              {terms.mode === 'BAR' ? terms.prepArea : STATION_LABEL[ticket.station]} ·{' '}
              {KITCHEN_TICKET_STATUS_LABEL[ticket.status]}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Productos del pedido">
        {items.length === 0 ? (
          <li className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <ShoppingBasketIcon className="size-8" />
            Toca un producto para agregarlo.
          </li>
        ) : null}
        {items.map((item) => {
          const cancelled = item.status === OrderItemStatus.CANCELLED;
          const pending = item.status === OrderItemStatus.PENDING;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!editable || cancelled}
                onClick={() => {
                  onSelectItem(item);
                }}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-accent/60 disabled:hover:bg-transparent',
                  pending && 'bg-status-waiting-food/10',
                  cancelled && 'text-muted-foreground line-through',
                )}
              >
                <span className="min-w-7 rounded-md bg-muted px-1.5 py-0.5 text-center text-sm font-bold tabular-nums">
                  {item.quantity}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.productName}</span>
                  {item.notes ? (
                    <span className="text-xs text-muted-foreground">· {item.notes}</span>
                  ) : null}
                  {item.discount > 0 ? (
                    <span className="text-xs text-primary">Descuento −{money(item.discount)}</span>
                  ) : null}
                  {pending ? (
                    <span className="text-[11px] font-semibold text-status-waiting-food">
                      Sin enviar
                    </span>
                  ) : null}
                  {cancelled && item.cancelReason ? (
                    <span className="text-xs">Anulado: {item.cancelReason}</span>
                  ) : null}
                </span>
                <span className="font-semibold tabular-nums">{money(item.total)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-y-0.5 border-t px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right tabular-nums">{money(order.subtotal)}</dd>
        {order.discountTotal > 0 ? (
          <>
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="text-right tabular-nums">−{money(order.discountTotal)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Impuestos</dt>
        <dd className="text-right tabular-nums">{money(order.taxTotal)}</dd>
        {order.tipAmount > 0 ? (
          <>
            <dt className="text-muted-foreground">Propina ({order.tipPercent} %)</dt>
            <dd className="text-right tabular-nums">{money(order.tipAmount)}</dd>
          </>
        ) : null}
        <dt className="pt-1 text-lg font-bold">Total</dt>
        <dd className="pt-1 text-right text-lg font-bold tabular-nums">{money(order.total)}</dd>
        {order.paidAmount > 0 ? (
          <>
            <dt className="text-muted-foreground">Pagado</dt>
            <dd className="text-right tabular-nums">{money(order.paidAmount)}</dd>
            <dt className="font-semibold">Pendiente</dt>
            <dd className="text-right font-semibold tabular-nums">{money(order.pendingAmount)}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
