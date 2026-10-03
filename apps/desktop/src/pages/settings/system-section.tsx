import { queryKeys, useApi, useApiMutation, useHasPermission, useSettings } from '@karbon/client';
import { type BackupDto, type LicenseStatusDto, Permission } from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  Field,
  notifyError,
  Spinner,
  Switch,
  Textarea,
  toast,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, DatabaseBackupIcon, KeyRoundIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { formatDate, formatDateTime } from '../../lib/format';
import { useRuntime } from '../../lib/runtime-context';
import { Section } from './section';

const REASON_LABEL: Record<BackupDto['reason'], string> = {
  SCHEDULED: 'Programado',
  CASH_CLOSE: 'Cierre de caja',
  MANUAL: 'Manual',
  PRE_RESTORE: 'Antes de restaurar',
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SystemSection() {
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  return (
    <div className="flex flex-col gap-5">
      <AppSection />
      <LicenseSection canWrite={canWrite} />
      <BackupsSection canWrite={canWrite} />
    </div>
  );
}

function AppSection() {
  const api = useApi();
  const { desktop } = useRuntime();
  const [autoStart, setAutoStart] = useState(desktop?.autoStart ?? false);
  const health = useQuery({
    queryKey: [...queryKeys.system, 'health'],
    queryFn: api.system.health,
  });
  return (
    <Section title="Aplicación" description="Versión instalada y comportamiento de este equipo.">
      <dl className="grid grid-cols-2 gap-y-1 text-sm md:grid-cols-4">
        <dt className="text-muted-foreground">Servidor</dt>
        <dd>
          {health.data
            ? `v${health.data.version} · base de datos ${health.data.database === 'up' ? 'OK' : 'sin conexión'}`
            : '—'}
        </dd>
        {desktop ? (
          <>
            <dt className="text-muted-foreground">Escritorio</dt>
            <dd>
              v{desktop.appVersion} · Electron {desktop.electronVersion}
            </dd>
          </>
        ) : null}
      </dl>
      {desktop && window.karbon ? (
        <Switch
          checked={autoStart}
          label="Iniciar Karbon con Windows (el servidor queda disponible para los celulares)"
          onCheckedChange={(enabled) => {
            void window.karbon?.setAutoStart(enabled).then(setAutoStart).catch(notifyError);
          }}
        />
      ) : null}
    </Section>
  );
}

const LICENSE_LABEL: Record<LicenseStatusDto['state'], string> = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  EXPIRED: 'Vencida',
  INVALID: 'Inválida',
};

function LicenseSection({ canWrite }: { canWrite: boolean }) {
  const api = useApi();
  const branchId = useSettings().data?.branchId;
  const license = useQuery({
    queryKey: [...queryKeys.system, 'license'],
    queryFn: api.system.license,
  });
  const [key, setKey] = useState('');
  const activate = useApiMutation(
    () => api.system.activateLicense({ licenseKey: key.trim() }),
    [[...queryKeys.system, 'license']],
    {
      onSuccess: () => {
        setKey('');
        toast.success('Licencia activada');
      },
      onError: notifyError,
    },
  );
  const data = license.data;
  return (
    <Section
      title="Licencia"
      description="La licencia se valida sin conexión a internet con una firma digital."
    >
      {license.isPending ? <Spinner /> : null}
      {data ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge
            variant={
              data.state === 'ACTIVE'
                ? 'default'
                : data.state === 'TRIAL'
                  ? 'secondary'
                  : 'destructive'
            }
          >
            {LICENSE_LABEL[data.state]}
          </Badge>
          {data.licensee ? <span>{data.licensee}</span> : null}
          {data.plan ? <span className="text-muted-foreground">Plan {data.plan}</span> : null}
          {data.maxTerminals ? (
            <span className="text-muted-foreground">{data.maxTerminals} terminales</span>
          ) : null}
          {data.expiresAt ? (
            <span className="text-muted-foreground">Vence {formatDate(data.expiresAt)}</span>
          ) : null}
          {data.state === 'TRIAL' && data.trialDaysLeft !== null ? (
            <span className="text-muted-foreground">
              {data.trialDaysLeft} días de prueba restantes
            </span>
          ) : null}
        </div>
      ) : null}
      {branchId ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Código de instalación (para solicitar la licencia):
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {branchId}
          </code>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Copiar código de instalación"
            onClick={() => {
              navigator.clipboard.writeText(branchId).then(() => {
                toast.success('Código copiado');
              }, notifyError);
            }}
          >
            <CopyIcon />
          </Button>
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-col gap-2">
          <Field label="Clave de licencia">
            {(id) => (
              <Textarea
                id={id}
                className="min-h-16 font-mono text-xs"
                placeholder="KARBON1.…"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                }}
              />
            )}
          </Field>
          <Button
            className="self-start"
            disabled={key.trim().length < 20 || activate.isPending}
            onClick={() => {
              activate.mutate(undefined);
            }}
          >
            <KeyRoundIcon /> Activar
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function BackupsSection({ canWrite }: { canWrite: boolean }) {
  const api = useApi();
  const backups = useQuery({
    queryKey: [...queryKeys.system, 'backups'],
    queryFn: api.system.backups,
    retry: false,
  });
  const [restoring, setRestoring] = useState<BackupDto | null>(null);
  const invalidate = [[...queryKeys.system, 'backups']];
  const create = useApiMutation(() => api.system.createBackup(), invalidate, {
    onSuccess: (backup) => toast.success(`Respaldo creado (${formatSize(backup.sizeBytes)})`),
    onError: notifyError,
  });
  const restore = useApiMutation(
    (fileName: string) => api.system.restoreBackup(fileName),
    invalidate,
    {
      onSuccess: () => {
        toast.success('Respaldo restaurado. La aplicación se recargará.');
        window.setTimeout(() => {
          window.location.reload();
        }, 1500);
      },
    },
  );
  const columns: Column<BackupDto>[] = [
    { key: 'date', header: 'Fecha', cell: (backup) => formatDateTime(backup.createdAt) },
    { key: 'reason', header: 'Origen', cell: (backup) => REASON_LABEL[backup.reason] },
    {
      key: 'size',
      header: 'Tamaño',
      align: 'right',
      cell: (backup) => formatSize(backup.sizeBytes),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (backup) =>
        canWrite ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRestoring(backup);
            }}
          >
            <RotateCcwIcon /> Restaurar
          </Button>
        ) : null,
    },
  ];
  return (
    <Section
      title="Respaldos"
      description="Se hace uno automático cada noche y al cerrar la caja. Se conservan los últimos 30."
      actions={
        canWrite ? (
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => {
              create.mutate(undefined);
            }}
          >
            <DatabaseBackupIcon /> {create.isPending ? 'Respaldando…' : 'Respaldar ahora'}
          </Button>
        ) : null
      }
    >
      {backups.isError ? (
        <p className="text-sm text-muted-foreground">
          Los respaldos no están disponibles en este servidor.
        </p>
      ) : null}
      {backups.data ? (
        <DataTable
          columns={columns}
          rows={backups.data}
          rowKey={(backup) => backup.fileName}
          empty={<p className="text-sm text-muted-foreground">Aún no hay respaldos.</p>}
        />
      ) : null}
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
        title="Restaurar respaldo"
        description={`Se reemplazan TODOS los datos por los del ${restoring ? formatDateTime(restoring.createdAt) : ''}. Antes se guarda un respaldo del estado actual. Las demás terminales deben volver a ingresar.`}
        confirmLabel="Restaurar"
        destructive
        onConfirm={() => restore.mutateAsync(restoring?.fileName ?? '')}
      />
    </Section>
  );
}
