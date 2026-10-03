import type { BackupDto } from '@karbon/types';

type Reason = BackupDto['reason'];

const REASON_SLUG: Readonly<Record<Reason, string>> = {
  SCHEDULED: 'programado',
  CASH_CLOSE: 'cierre-caja',
  MANUAL: 'manual',
  PRE_RESTORE: 'antes-restaurar',
};

const FILE_PATTERN = /^karbon-([0-9]{8})-([0-9]{6})-([a-z-]+)\.dump$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `karbon-20260926-031500-programado.dump` (hora UTC: ordena igual en cualquier zona). */
export function backupFileName(reason: Reason, date: Date): string {
  const stamp = `${String(date.getUTCFullYear())}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `karbon-${stamp}-${time}-${REASON_SLUG[reason]}.dump`;
}

/** Solo acepta nombres generados por el sistema: evita rutas arbitrarias al restaurar. */
export function parseBackupFileName(fileName: string): { reason: Reason; createdAt: Date } | null {
  const match = FILE_PATTERN.exec(fileName);
  if (!match) return null;
  const [, stamp = '', time = '', slug] = match;
  const reason = (Object.keys(REASON_SLUG) as Reason[]).find((key) => REASON_SLUG[key] === slug);
  if (!reason) return null;
  const createdAt = new Date(
    Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4)),
      Number(time.slice(4, 6)),
    ),
  );
  return Number.isNaN(createdAt.getTime()) ? null : { reason, createdAt };
}

/**
 * Variables de libpq a partir de DATABASE_URL. La clave viaja por entorno (no en la línea de
 * comandos, visible para otros procesos) y se descartan parámetros propios de Prisma.
 */
export function pgEnvironment(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ''),
  };
}
