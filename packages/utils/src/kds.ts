import { type KitchenTicketDto, KitchenTicketStatus } from '@karbon/types';

export type TicketUrgency = 'normal' | 'warning' | 'critical';

export interface UrgencyThresholds {
  warningMinutes: number;
  criticalMinutes: number;
}

export const DEFAULT_KDS_THRESHOLDS: Readonly<UrgencyThresholds> = Object.freeze({
  warningMinutes: 10,
  criticalMinutes: 20,
});

const MS_PER_MINUTE = 60_000;

/** Color de la comanda en el KDS según el tiempo transcurrido: verde → amarillo → rojo. */
export function getTicketUrgency(
  elapsedMs: number,
  thresholds: UrgencyThresholds = DEFAULT_KDS_THRESHOLDS,
): TicketUrgency {
  if (thresholds.warningMinutes >= thresholds.criticalMinutes) {
    throw new RangeError('El umbral de advertencia debe ser menor que el crítico');
  }
  const minutes = elapsedMs / MS_PER_MINUTE;
  if (minutes >= thresholds.criticalMinutes) return 'critical';
  if (minutes >= thresholds.warningMinutes) return 'warning';
  return 'normal';
}

export interface TicketTiming {
  /** En cocina: envío → listo; mientras no esté lista, envío → ahora. */
  kitchenMs: number;
  /** Esperando al mesero: listo → entregado (o → ahora); `null` si aún no está lista. */
  pickupMs: number | null;
  /** Envío → entrega; `null` mientras no se entrega. */
  totalMs: number | null;
  /** Entregada o cancelada: ningún valor depende de la hora actual, el cronómetro no avanza. */
  stopped: boolean;
}

type TimedTicket = Pick<KitchenTicketDto, 'status' | 'createdAt' | 'readyAt' | 'deliveredAt'>;

/**
 * Tiempos de una comanda a partir de sus marcas reales. `now` solo interviene en las etapas
 * en curso: una comanda entregada muestra siempre el mismo total aunque la pantalla se refresque.
 */
export function ticketTiming(ticket: TimedTicket, now: number): TicketTiming {
  const created = Date.parse(ticket.createdAt);
  const ready = ticket.readyAt ? Date.parse(ticket.readyAt) : null;
  const delivered = ticket.deliveredAt ? Date.parse(ticket.deliveredAt) : null;
  const span = (from: number, to: number): number => Math.max(0, to - from);

  switch (ticket.status) {
    case KitchenTicketStatus.NEW:
    case KitchenTicketStatus.PREPARING:
      return { kitchenMs: span(created, now), pickupMs: null, totalMs: null, stopped: false };
    case KitchenTicketStatus.READY: {
      const readyAt = ready ?? now;
      return {
        kitchenMs: span(created, readyAt),
        pickupMs: span(readyAt, now),
        totalMs: null,
        stopped: false,
      };
    }
    case KitchenTicketStatus.DELIVERED: {
      // Sin marca de entrega (datos antiguos) el último instante conocido es "listo".
      const end = delivered ?? ready ?? created;
      const readyAt = ready ?? end;
      return {
        kitchenMs: span(created, readyAt),
        pickupMs: span(readyAt, end),
        totalMs: span(created, end),
        stopped: true,
      };
    }
    case KitchenTicketStatus.CANCELLED:
      return {
        kitchenMs: ready === null ? 0 : span(created, ready),
        pickupMs: null,
        totalMs: null,
        stopped: true,
      };
  }
}

/** Cronómetro `mm:ss`, o `h:mm:ss` a partir de una hora. Valores negativos cuentan como 0. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
