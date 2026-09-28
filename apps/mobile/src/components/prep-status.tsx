import { useTerminology, useUrgencyThresholds } from '@karbon/client';
import { cn, URGENCY_META } from '@karbon/ui';
import {
  formatElapsed,
  getTicketUrgency,
  type PreparationSummary,
  type TicketUrgency,
} from '@karbon/utils';
import {
  ClockIcon,
  HandPlatterIcon,
  type LucideIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react';

const URGENCY_ICON: Record<TicketUrgency, LucideIcon> = {
  normal: ClockIcon,
  warning: TriangleAlertIcon,
  critical: OctagonAlertIcon,
};

/** Tiempo en cocina con su urgencia: color, ícono y texto ("Demorado"), nunca solo color. */
export function UrgencyBadge({
  since,
  now,
  label,
  className,
}: {
  since: string;
  now: number;
  /** Qué espera: "En cocina", "En barra"… */
  label: string;
  className?: string;
}) {
  const thresholds = useUrgencyThresholds();
  const elapsed = now - Date.parse(since);
  const urgency = getTicketUrgency(elapsed, thresholds);
  const meta = URGENCY_META[urgency];
  const Icon = URGENCY_ICON[urgency];
  return (
    // En tarjetas angostas pasa a dos líneas en lugar de cortar el texto de la urgencia.
    <span
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-2 py-1 text-xs font-semibold',
        meta.badgeClass,
        urgency === 'critical' && 'animate-pulse',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
        <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
      </span>
      <span className="font-bold">{meta.label}</span>
    </span>
  );
}

/** Lo listo para recoger primero (es lo que el mesero debe hacer ya) y luego la espera en cocina. */
export function PrepStatus({
  summary,
  now,
  className,
}: {
  summary: PreparationSummary;
  now: number;
  className?: string;
}) {
  const terms = useTerminology();
  const { readyTickets, preparingSince } = summary;
  if (readyTickets === 0 && preparingSince === null) return null;
  return (
    <span className={cn('flex flex-col items-start gap-1', className)}>
      {readyTickets > 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
          <HandPlatterIcon className="size-3.5 shrink-0" aria-hidden />
          {readyTickets === 1
            ? 'Listo para recoger'
            : `${String(readyTickets)} listos para recoger`}
        </span>
      ) : null}
      {preparingSince ? (
        <UrgencyBadge
          since={preparingSince}
          now={now}
          label={`En ${terms.prepArea.toLowerCase()}`}
        />
      ) : null}
    </span>
  );
}
