import { queryKeys, useApi, useApiMutation, useHasPermission, useTaxes } from '@karbon/client';
import { Permission, TaxKind, type TaxDto } from '@karbon/types';
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
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Section } from './section';

const KIND_LABEL: Record<TaxKind, string> = {
  VAT: 'IVA',
  CONSUMPTION: 'Impuesto al consumo',
  OTHER: 'Otro',
};

export function TaxesSection() {
  const taxes = useTaxes();
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const [editing, setEditing] = useState<{ tax: TaxDto | null } | null>(null);
  const columns: Column<TaxDto>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (tax) => <span className="font-medium">{tax.name}</span>,
    },
    { key: 'kind', header: 'Tipo', cell: (tax) => KIND_LABEL[tax.kind] },
    { key: 'rate', header: 'Tarifa', align: 'right', cell: (tax) => `${tax.rate} %` },
    {
      key: 'flags',
      header: '',
      cell: (tax) => (
        <span className="flex gap-1">
          {tax.isDefault ? <Badge>Por defecto</Badge> : null}
          {tax.isActive ? null : <Badge variant="outline">Inactivo</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (tax) =>
        canWrite ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Editar"
            onClick={() => {
              setEditing({ tax });
            }}
          >
            <PencilIcon />
          </Button>
        ) : null,
    },
  ];
  return (
    <Section
      title="Impuestos"
      description="En Colombia: impuesto al consumo del 8 % para restaurantes y bares, o IVA según el régimen."
      actions={
        canWrite ? (
          <Button
            variant="outline"
            onClick={() => {
              setEditing({ tax: null });
            }}
          >
            <PlusIcon /> Nuevo impuesto
          </Button>
        ) : null
      }
    >
      <DataTable columns={columns} rows={taxes.data ?? []} rowKey={(tax) => tax.id} />
      {editing ? (
        <TaxDialog
          tax={editing.tax}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </Section>
  );
}

function TaxDialog({ tax, onClose }: { tax: TaxDto | null; onClose: () => void }) {
  const api = useApi();
  const [name, setName] = useState(tax?.name ?? '');
  const [kind, setKind] = useState<TaxKind>(tax?.kind ?? TaxKind.CONSUMPTION);
  const [rate, setRate] = useState(String(tax?.rate ?? 8));
  const [isDefault, setIsDefault] = useState(tax?.isDefault ?? false);
  const [isActive, setIsActive] = useState(tax?.isActive ?? true);
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), kind, rate: Number(rate), isDefault };
      return tax
        ? api.settings.updateTax(tax.id, { ...body, isActive })
        : api.settings.createTax(body);
    },
    [queryKeys.taxes, queryKeys.products],
    {
      onSuccess: () => {
        toast.success('Impuesto guardado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const invalidRate = !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={tax ? `Editar ${tax.name}` : 'Nuevo impuesto'}
        description="Cambiar la tarifa solo afecta los productos que se agreguen desde ahora."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={name.trim().length < 2 || invalidRate || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" className="col-span-2">
            {(id) => (
              <Input
                id={id}
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as TaxKind);
                }}
              >
                {Object.values(TaxKind).map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABEL[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tarifa (%)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                step="any"
                value={rate}
                onChange={(event) => {
                  setRate(event.target.value);
                }}
              />
            )}
          </Field>
        </div>
        <Switch
          checked={isDefault}
          onCheckedChange={setIsDefault}
          label="Impuesto por defecto de los productos"
        />
        {tax ? <Switch checked={isActive} onCheckedChange={setIsActive} label="Activo" /> : null}
      </DialogContent>
    </Dialog>
  );
}
