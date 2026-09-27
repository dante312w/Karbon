import { type KitchenTicketDto, KitchenTicketStatus } from '@karbon/types';
import { Button, cn } from '@karbon/ui';
import {
  formatElapsed,
  getTicketUrgency,
  STATION_LABEL,
  type TicketUrgency,
  type UrgencyThresholds,
} from '@karbon/utils';
import { CheckIcon, ChefHatIcon, HandPlatterIcon, Undo2Icon } from 'lucide-react';

const URGENCY_CLASS: Record<TicketUrgency, { border: string; header: string }> = {
  normal: { border: 'border-urgency-normal', header: 'bg-urgency-normal text-black' },
  warning: { border: 'border-urgency-warning', header: 'bg-urgency-warning text-black' },
  critical: { border: 'border-urgency-critical', header: 'bg-urgency-critical text-white' },
};

export interface TicketAction {
  label: string;
  to: KitchenTicketStatus;
  primary?: boolean;
}

/** Siguiente paso de cada estado (y el retroceso para corregir un toque accidental). */
function actionsFor(status: KitchenTicketStatus): TicketAction[] {
  switch (status) {
    case KitchenTicketStatus.NEW:
      return [
        { label: 'Preparar', to: KitchenTicketStatus.PREPARING, primary: true },
        { label: 'Listo', to: KitchenTicketStatus.READY },
      ];
    case KitchenTicketStatus.PREPARING:
      return [
        { label: 'Listo', to: KitchenTicketStatus.READY, primary: true },
        { label: 'Volver', to: KitchenTicketStatus.NEW },
      ];
    case KitchenTicketStatus.READY:
      return [
        { label: 'Entregado', to: KitchenTicketStatus.DELIVERED, primary: true },
        { label: 'Volver', to: KitchenTicketStatus.PREPARING },
      ];
    case KitchenTicketStatus.DELIVERED:
      return [{ label: 'Devolver a listos', to: KitchenTicketStatus.READY }];
    case KitchenTicketStatus.CANCELLED:
      return [];
  }
}

const ACTION_ICON = {
  PREPARING: ChefHatIcon,
  READY: CheckIcon,
  DELIVERED: HandPlatterIcon,
  NEW: Undo2Icon,
  CANCELLED: Undo2Icon,
} as const;

export function TicketCard({
  ticket,
  now,
  thresholds,
  showStation,
  canUpdate,
  busy,
  onChangeStatus,
}: {
  ticket: KitchenTicketDto;
  now: number;
  thresholds: UrgencyThresholds;
  showStation: boolean;
  canUpdate: boolean;
  busy: boolean;
  onChangeStatus: (ticket: KitchenTicketDto, status: KitchenTicketStatus) => void;
}) {
  const waiting = now - Date.parse(ticket.createdAt);
  const ready =
    ticket.status === KitchenTicketStatus.READY || ticket.status === KitchenTicketStatus.DELIVERED;
  const urgency = ready ? 'normal' : getTicketUrgency(waiting, thresholds);
  const style = URGENCY_CLASS[urgency];

  return (
    // shrink-0: con muchas comandas la columna hace scroll en lugar de aplastar las tarjetas
    // (y con ellas los botones). overflow-clip (no hidden) recorta las esquinas sin crear un
    // contenedor de scroll, así el encabezado puede quedar fijo arriba en comandas largas.
    <article
      className={cn(
        'flex shrink-0 flex-col overflow-clip rounded-xl border-2 bg-card shadow-soft',
        style.border,
        ticket.status === KitchenTicketStatus.DELIVERED && 'opacity-60',
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
        <span className="font-mono text-lg font-bold tabular-nums">
          {ready && ticket.readyAt
            ? `✓ ${formatElapsed(now - Date.parse(ticket.readyAt))}`
            : formatElapsed(waiting)}
        </span>
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
      {canUpdate ? (
        <footer className="mt-auto flex flex-wrap gap-2 border-t p-2">
          {actionsFor(ticket.status).map((action) => {
            const Icon = ACTION_ICON[action.to];
            return (
              <Button
                key={action.to}
                size={action.primary ? 'lg' : 'md'}
                variant={action.primary ? 'default' : 'outline'}
                className={action.primary ? 'flex-1' : ''}
                disabled={busy}
                onClick={() => {
                  onChangeStatus(ticket, action.to);
                }}
              >
                <Icon /> {action.label}
              </Button>
            );
          })}
        </footer>
      ) : null}
    </article>
  );
}
