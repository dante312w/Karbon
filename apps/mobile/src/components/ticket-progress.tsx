import { useOrderAccess, useTerminology, useTicketDelivery } from '@karbon/client';
import { type KitchenTicketDto, KitchenTicketStatus, type OrderDto } from '@karbon/types';
import { Button, cn, notifyError, toast, useNow } from '@karbon/ui';
import { formatElapsed, formatTime, STATION_LABEL, ticketTiming } from '@karbon/utils';
import { CheckCheckIcon, ChefHatIcon, ClockIcon, HandPlatterIcon } from 'lucide-react';
import { vibrate } from '../lib/haptics';
import { UrgencyBadge } from './prep-status';

const STEP = {
  NEW: { label: 'En cola', icon: ClockIcon, tone: 'bg-muted text-foreground' },
  PREPARING: {
    label: 'Preparando',
    icon: ChefHatIcon,
    tone: 'bg-status-waiting-food/20 text-foreground',
  },
  READY: {
    label: 'Listo para recoger',
    icon: HandPlatterIcon,
    tone: 'bg-primary text-primary-foreground',
  },
  DELIVERED: { label: 'Entregado', icon: CheckCheckIcon, tone: 'bg-muted text-muted-foreground' },
} as const;

type VisibleStatus = keyof typeof STEP;

function isVisible(ticket: KitchenTicketDto): ticket is KitchenTicketDto & {
  status: VisibleStatus;
} {
  return ticket.status !== KitchenTicketStatus.CANCELLED;
}

/**
 * Cómo va cada comanda del pedido: estado con texto e ícono (no solo color), tiempo real
 * mientras está en curso y fijo al entregarse. Lo listo se confirma aquí al llevarlo a la mesa.
 */
export function TicketProgress({ order }: { order: OrderDto }) {
  const terms = useTerminology();
  const canDeliver = useOrderAccess().canDeliver(order.waiter.id);
  const tickets = order.tickets.filter(isVisible);
  // Sin comandas en curso no hace falta reloj: los tiempos entregados ya no cambian.
  const running = tickets.some((ticket) => ticket.status !== KitchenTicketStatus.DELIVERED);
  const now = useNow(1_000, running);
  const delivery = useTicketDelivery(order.id, {
    onDelivered: (_order, ticketId) => {
      vibrate(20);
      toast.success('Entrega confirmada', {
        action: {
          label: 'Deshacer',
          onClick: () => {
            delivery.undo.mutate(ticketId);
          },
        },
      });
    },
    onError: notifyError,
  });

  if (tickets.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-2 bg-background px-3 pb-3"
      aria-label="Estado de preparación"
    >
      {tickets.map((ticket) => {
        const step = STEP[ticket.status];
        const timing = ticketTiming(ticket, now);
        const where = terms.mode === 'BAR' ? terms.prepArea : STATION_LABEL[ticket.station];
        const inKitchen =
          ticket.status === KitchenTicketStatus.NEW ||
          ticket.status === KitchenTicketStatus.PREPARING;
        const clock =
          ticket.status === KitchenTicketStatus.READY
            ? `hace ${formatElapsed(timing.pickupMs ?? 0)}`
            : ticket.status === KitchenTicketStatus.DELIVERED
              ? `total ${formatElapsed(timing.totalMs ?? 0)}`
              : formatElapsed(timing.kitchenMs);
        return (
          <article
            key={ticket.id}
            className={cn(
              'flex flex-col gap-2 rounded-2xl border p-3',
              ticket.status === KitchenTicketStatus.READY && 'border-primary shadow-soft',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn('grid size-10 shrink-0 place-items-center rounded-full', step.tone)}
                aria-hidden
              >
                <step.icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                {inKitchen ? (
                  <UrgencyBadge since={ticket.createdAt} now={now} label={step.label} />
                ) : (
                  <p className="text-sm font-semibold">
                    {step.label} <span className="font-mono tabular-nums">· {clock}</span>
                  </p>
                )}
                <p className="w-full truncate text-xs text-muted-foreground">
                  Ronda {ticket.sequence} · {where} · enviado {formatTime(ticket.createdAt)}
                </p>
                <p className="w-full truncate text-xs">
                  {ticket.items
                    .filter((item) => item.status !== 'CANCELLED')
                    .map((item) => `${String(item.quantity)}× ${item.productName}`)
                    .join(', ')}
                </p>
              </div>
            </div>
            {ticket.status === KitchenTicketStatus.READY && canDeliver ? (
              <Button
                size="touch"
                className="w-full"
                disabled={delivery.deliver.isPending}
                onClick={() => {
                  delivery.deliver.mutate(ticket.id);
                }}
              >
                <HandPlatterIcon /> Entregado en la mesa
              </Button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
