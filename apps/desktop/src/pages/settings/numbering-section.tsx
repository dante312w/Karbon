import { queryKeys, useApi, useApiMutation, useHasPermission } from '@karbon/client';
import { FiscalDocumentType, type NumberingRangeDto, Permission } from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  Select,
  Switch,
  toast,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../../lib/format';
import { Section } from './section';

const TYPE_LABEL: Record<FiscalDocumentType, string> = {
  RECEIPT: 'Tiquete de venta',
  POS_EQUIVALENT: 'Documento equivalente POS',
  INVOICE: 'Factura de venta',
  ELECTRONIC_INVOICE: 'Factura electrónica',
  CREDIT_NOTE: 'Nota crédito',
};

export function NumberingSection() {
  const api = useApi();
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const ranges = useQuery({
    queryKey: queryKeys.numberingRanges,
    queryFn: api.settings.numberingRanges,
  });
  const [creating, setCreating] = useState(false);
  const toggle = useApiMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.settings.setNumberingRangeActive(id, isActive),
    [queryKeys.numberingRanges],
    {
      onError: notifyError,
    },
  );
  const columns: Column<NumberingRangeDto>[] = [
    { key: 'type', header: 'Documento', cell: (range) => TYPE_LABEL[range.documentType] },
    { key: 'prefix', header: 'Prefijo', cell: (range) => range.prefix || '—' },
    { key: 'range', header: 'Rango', cell: (range) => `${range.rangeFrom} – ${range.rangeTo}` },
    {
      key: 'next',
      header: 'Siguiente',
      align: 'right',
      cell: (range) => {
        const left = range.rangeTo - range.nextNumber + 1;
        return (
          <span className="flex flex-col items-end">
            <span className="font-semibold">{range.nextNumber}</span>
            <span
              className={left < 100 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
            >
              {Math.max(0, left)} disponibles
            </span>
          </span>
        );
      },
    },
    {
      key: 'resolution',
      header: 'Resolución',
      cell: (range) =>
        range.resolutionNumber
          ? `${range.resolutionNumber}${range.validUntil ? ` · vence ${formatDate(range.validUntil)}` : ''}`
          : '—',
    },
    {
      key: 'active',
      header: 'Activo',
      cell: (range) =>
        canWrite ? (
          <Switch
            checked={range.isActive}
            disabled={toggle.isPending}
            onCheckedChange={(isActive) => {
              toggle.mutate({ id: range.id, isActive });
            }}
          />
        ) : range.isActive ? (
          <Badge>Activo</Badge>
        ) : null,
    },
  ];
  return (
    <Section
      title="Numeración de documentos"
      description="Rangos autorizados (resolución DIAN) para tiquetes, documento equivalente POS y facturas. Solo un rango activo por tipo."
      actions={
        canWrite ? (
          <Button
            variant="outline"
            onClick={() => {
              setCreating(true);
            }}
          >
            <PlusIcon /> Nuevo rango
          </Button>
        ) : null
      }
    >
      <DataTable columns={columns} rows={ranges.data ?? []} rowKey={(range) => range.id} />
      {creating ? (
        <RangeDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </Section>
  );
}

function RangeDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [form, setForm] = useState({
    documentType: FiscalDocumentType.POS_EQUIVALENT as FiscalDocumentType,
    prefix: '',
    rangeFrom: '1',
    rangeTo: '5000',
    resolutionNumber: '',
    resolutionDate: '',
    validFrom: '',
    validUntil: '',
    technicalKey: '',
  });
  const set = (key: keyof typeof form, value: string): void => {
    setForm({ ...form, [key]: value });
  };
  const optional = (value: string): string | null => value.trim() || null;
  const from = Number(form.rangeFrom);
  const to = Number(form.rangeTo);
  const save = useApiMutation(
    () =>
      api.settings.createNumberingRange({
        documentType: form.documentType,
        prefix: form.prefix.trim().toUpperCase(),
        rangeFrom: from,
        rangeTo: to,
        resolutionNumber: optional(form.resolutionNumber),
        resolutionDate: optional(form.resolutionDate),
        validFrom: optional(form.validFrom),
        validUntil: optional(form.validUntil),
        technicalKey: optional(form.technicalKey),
      }),
    [queryKeys.numberingRanges],
    {
      onSuccess: () => {
        toast.success('Rango creado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const text = (key: keyof typeof form, label: string, type = 'text') => (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type={type}
          value={form[key]}
          onChange={(event) => {
            set(key, event.target.value);
          }}
        />
      )}
    </Field>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Nuevo rango de numeración"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!(from >= 1 && to > from) || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Crear rango
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de documento" className="col-span-2">
            {(id) => (
              <Select
                id={id}
                value={form.documentType}
                onChange={(event) => {
                  set('documentType', event.target.value);
                }}
              >
                {Object.values(FiscalDocumentType).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {text('prefix', 'Prefijo')}
          {text('resolutionNumber', 'N.º de resolución')}
          {text('rangeFrom', 'Desde', 'number')}
          {text('rangeTo', 'Hasta', 'number')}
          {text('resolutionDate', 'Fecha de resolución', 'date')}
          {text('validUntil', 'Vigente hasta', 'date')}
          {text('validFrom', 'Vigente desde', 'date')}
          {form.documentType === FiscalDocumentType.ELECTRONIC_INVOICE
            ? text('technicalKey', 'Clave técnica')
            : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
