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

/** Cronómetro `mm:ss`, o `h:mm:ss` a partir de una hora. Valores negativos cuentan como 0. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
