import { type KitchenTicketDto, KitchenTicketStatus } from '@karbon/types';
import { Button, cn } from '@karbon/ui';
import {
  formatElapsed,
  getTicketUrgency,
  STATION_LABEL,
  ticketTiming,
  type TicketUrgency,
  type UrgencyThresholds,
} from '@karbon/utils';
import { CheckIcon, ChefHatIcon, HandPlatterIcon, type LucideIcon, Undo2Icon } from 'lucide-react';
import { formatTime } from '../../lib/format';

const URGENCY_CLASS: Record<TicketUrgency, { border: string; header: string }> = {
  normal: { border: 'border-urgency-normal', header: 'bg-urgency-normal text-black' },
  warning: { border: 'border-urgency-warning', header: 'bg-urgency-warning text-black' },
  critical: { border: 'border-urgency-critical', header: 'bg-urgency-critical text-white' },
};

/** Cocina prepara (hasta "Listo"); la entrega la confirma el servicio. */
export type TicketCommand =
  { kind: 'kitchen'; to: KitchenTicketStatus } | { kind: 'deliver' } | { kind: 'undeliver' };

interface TicketAction {
  label: string;
  command: TicketCommand;
  icon: LucideIcon;
  primary?: boolean;
}

/** Siguiente paso de cada estado y el retroceso para corregir un toque accidental. */
function actionsFor(
  status: KitchenTicketStatus,
  can: { update: boolean; deliver: boolean },
): TicketAction[] {
  const kitchen = (to: KitchenTicketStatus): TicketCommand => ({ kind: 'kitchen', to });
  switch (status) {
    case KitchenTicketStatus.NEW:
      return can.update
        ? [
            {
              label: 'Preparar',
              command: kitchen(KitchenTicketStatus.PREPARING),
              icon: ChefHatIcon,
              primary: true,
            },
            { label: 'Listo', command: kitchen(KitchenTicketStatus.READY), icon: CheckIcon },
          ]
        : [];
    case KitchenTicketStatus.PREPARING:
      return can.update
        ? [
            {
              label: 'Listo',
              command: kitchen(KitchenTicketStatus.READY),
              icon: CheckIcon,
              primary: true,
            },
            { label: 'Volver', command: kitchen(KitchenTicketStatus.NEW), icon: Undo2Icon },
          ]
        : [];
    case KitchenTicketStatus.READY:
      return [
        ...(can.deliver
          ? [
              {
                label: 'Entregado',
                command: { kind: 'deliver' } as const,
                icon: HandPlatterIcon,
                primary: true,
              },
            ]
          : []),
        ...(can.update
          ? [
              {
                label: 'Volver',
                command: kitchen(KitchenTicketStatus.PREPARING),
                icon: Undo2Icon,
              },
            ]
          : []),
      ];
    case KitchenTicketStatus.DELIVERED:
      return can.deliver
        ? [{ label: 'Devolver a listos', command: { kind: 'undeliver' }, icon: Undo2Icon }]
        : [];
    case KitchenTicketStatus.CANCELLED:
      return [];
  }
}

export function TicketCard({
  ticket,
  now,
  thresholds,
  showStation,
  canUpdate,
  canDeliver,
  busy,
  onCommand,
}: {
  ticket: KitchenTicketDto;
  now: number;
  thresholds: UrgencyThresholds;
  showStation: boolean;
  canUpdate: boolean;
  canDeliver: boolean;
  busy: boolean;
  onCommand: (ticket: KitchenTicketDto, command: TicketCommand) => void;
}) {
  // Los tiempos salen de las marcas reales: una comanda entregada no depende de `now`.
  const timing = ticketTiming(ticket, now);
  const inKitchen =
    ticket.status === KitchenTicketStatus.NEW || ticket.status === KitchenTicketStatus.PREPARING;
  const urgency = inKitchen ? getTicketUrgency(timing.kitchenMs, thresholds) : 'normal';
  const style = URGENCY_CLASS[urgency];
  const delivered = ticket.status === KitchenTicketStatus.DELIVERED;
  const actions = actionsFor(ticket.status, { update: canUpdate, deliver: canDeliver });

  return (
    // shrink-0: con muchas comandas la columna hace scroll en lugar de aplastar las tarjetas
    // (y con ellas los botones). overflow-clip (no hidden) recorta las esquinas sin crear un
    // contenedor de scroll, así el encabezado puede quedar fijo arriba en comandas largas.
    <article
      className={cn(
        'flex shrink-0 flex-col overflow-clip rounded-xl border-2 bg-card shadow-soft',
        style.border,
        delivered && 'opacity-70',
      )}
      aria-label={`Pedido ${ticket.orderNumber}`}
    >
      <header
        className={cn(
          'sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2',
          style.header,
          urgency === 'critical' && 'animate-pulse',
        )}
      >
        <span className="text-lg leading-none font-bold">
          {ticket.tableName ?? `#${ticket.orderNumber}`}
          {ticket.sequence > 1 ? (
            <span className="ml-2 text-sm font-semibold">Ronda {ticket.sequence}</span>
          ) : null}
        </span>
        <TicketClock ticket={ticket} timing={timing} />
      </header>
      <div className="flex items-center justify-between px-3 pt-2 text-xs text-muted-foreground">
        <span>
          #{ticket.orderNumber} · {ticket.waiterName}
        </span>
        {showStation ? (
          <span className="font-semibold">{STATION_LABEL[ticket.station]}</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5 px-3 py-2">
        {ticket.items.map((item) => {
          const cancelled = item.status === 'CANCELLED';
          return (
            <li
              key={item.id}
              className={cn('flex flex-col', cancelled && 'text-destructive line-through')}
            >
              <span className="text-base leading-snug font-semibold">
                <span className="mr-2 tabular-nums">{item.quantity}×</span>
                {item.productName}
                {cancelled ? (
                  <span className="ml-2 text-xs font-bold no-underline">ANULADO</span>
                ) : null}
              </span>
              {item.notes ? (
                <span className="ml-6 w-fit rounded bg-status-waiting-food/25 px-1.5 text-sm font-medium">
                  {item.notes}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {ticket.notes ? (
        <p className="mx-3 mb-2 rounded bg-muted px-2 py-1 text-sm">{ticket.notes}</p>
      ) : null}
      <TicketSummary ticket={ticket} timing={timing} />
      {actions.length > 0 ? (
        <footer className="mt-auto flex flex-wrap gap-2 border-t p-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              size={action.primary ? 'lg' : 'md'}
              variant={action.primary ? 'default' : 'outline'}
              className={action.primary ? 'flex-1' : ''}
              disabled={busy}
              onClick={() => {
                onCommand(ticket, action.command);
              }}
            >
              <action.icon /> {action.label}
            </Button>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

/** Cronómetro principal: en curso mientras cocina trabaja o el mesero no recoge; fijo al entregar. */
function TicketClock({
  ticket,
  timing,
}: {
  ticket: KitchenTicketDto;
  timing: ReturnType<typeof ticketTiming>;
}) {
  const [label, value] =
    ticket.status === KitchenTicketStatus.READY
      ? ['Por recoger', timing.pickupMs ?? 0]
      : ticket.status === KitchenTicketStatus.DELIVERED
        ? ['Total', timing.totalMs ?? 0]
        : [null, timing.kitchenMs];
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-lg font-bold tabular-nums">
      {label ? (
        <span className="font-sans text-xs font-semibold tracking-wide uppercase">{label}</span>
      ) : null}
      {formatElapsed(value)}
    </span>
  );
}

/** Tiempos ya cerrados de la comanda: preparación y, al entregar, quién y cuándo. */
function TicketSummary({
  ticket,
  timing,
}: {
  ticket: KitchenTicketDto;
  timing: ReturnType<typeof ticketTiming>;
}) {
  if (ticket.status === KitchenTicketStatus.READY) {
    return (
      <p className="mx-3 mb-2 text-sm text-muted-foreground">
        Preparado en{' '}
        <span className="font-semibold tabular-nums">{formatElapsed(timing.kitchenMs)}</span>
      </p>
    );
  }
  if (ticket.status !== KitchenTicketStatus.DELIVERED) return null;
  return (
    <p className="mx-3 mb-2 text-sm text-muted-foreground">
      Preparado en {formatElapsed(timing.kitchenMs)} · recogido en{' '}
      {formatElapsed(timing.pickupMs ?? 0)}
      <br />
      Entregado{ticket.deliveredAt ? ` a las ${formatTime(ticket.deliveredAt)}` : ''}
      {ticket.deliveredBy ? ` por ${ticket.deliveredBy.name}` : ' al cobrar la cuenta'}
    </p>
  );
}
