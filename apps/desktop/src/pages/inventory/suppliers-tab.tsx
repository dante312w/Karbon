import { queryKeys, useApi, useApiMutation, useHasPermission } from '@karbon/client';
import { type CreateSupplierRequest, Permission, type SupplierDto } from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  Spinner,
  Switch,
  Textarea,
  toast,
} from '@karbon/ui';
import { PencilIcon, PlusIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { useSuppliers } from './use-suppliers';

export function SuppliersTab() {
  const suppliers = useSuppliers();
  const canWrite = useHasPermission(Permission.SUPPLIERS_WRITE);
  const [editing, setEditing] = useState<{ supplier: SupplierDto | null } | null>(null);
  const columns: Column<SupplierDto>[] = [
    {
      key: 'name',
      header: 'Proveedor',
      cell: (supplier) => <span className="font-medium">{supplier.name}</span>,
    },
    { key: 'taxId', header: 'NIT', cell: (supplier) => supplier.taxId ?? '—' },
    { key: 'contact', header: 'Contacto', cell: (supplier) => supplier.contactName ?? '—' },
    { key: 'phone', header: 'Teléfono', cell: (supplier) => supplier.phone ?? '—' },
    { key: 'email', header: 'Correo', cell: (supplier) => supplier.email ?? '—' },
    {
      key: 'status',
      header: '',
      cell: (supplier) => (supplier.isActive ? null : <Badge variant="outline">Inactivo</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (supplier) =>
        canWrite ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Editar"
            onClick={() => {
              setEditing({ supplier });
            }}
          >
            <PencilIcon />
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <Button
          className="self-end"
          onClick={() => {
            setEditing({ supplier: null });
          }}
        >
          <PlusIcon /> Nuevo proveedor
        </Button>
      ) : null}
      {suppliers.isPending ? <Spinner /> : null}
      {suppliers.data ? (
        <DataTable
          columns={columns}
          rows={suppliers.data}
          rowKey={(supplier) => supplier.id}
          empty={<EmptyState icon={TruckIcon} title="Sin proveedores" />}
        />
      ) : null}
      {editing ? (
        <SupplierDialog
          supplier={editing.supplier}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

const FIELDS: { key: keyof Omit<CreateSupplierRequest, 'name' | 'notes'>; label: string }[] = [
  { key: 'taxId', label: 'NIT' },
  { key: 'contactName', label: 'Contacto' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Correo' },
  { key: 'address', label: 'Dirección' },
];

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier: SupplierDto | null;
  onClose: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<Record<string, string>>({
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const value = (key: string): string | null => {
    const text = form[key]?.trim() ?? '';
    return text === '' ? null : text;
  };
  const save = useApiMutation(
    () => {
      const body: CreateSupplierRequest = {
        name: form.name?.trim() ?? '',
        taxId: value('taxId'),
        contactName: value('contactName'),
        phone: value('phone'),
        email: value('email'),
        address: value('address'),
        notes: value('notes'),
      };
      return supplier
        ? api.inventory.updateSupplier(supplier.id, { ...body, isActive })
        : api.inventory.createSupplier(body);
    },
    [queryKeys.suppliers],
    {
      onSuccess: () => {
        toast.success('Proveedor guardado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const set = (key: string, next: string): void => {
    setForm({ ...form, [key]: next });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={supplier ? `Editar ${supplier.name}` : 'Nuevo proveedor'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={(form.name?.trim().length ?? 0) < 2 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <Field label="Razón social / nombre">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={form.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              {(id) => (
                <Input
                  id={id}
                  value={form[field.key]}
                  onChange={(event) => {
                    set(field.key, event.target.value);
                  }}
                />
              )}
            </Field>
          ))}
        </div>
        <Field label="Notas">
          {(id) => (
            <Textarea
              id={id}
              value={form.notes}
              onChange={(event) => {
                set('notes', event.target.value);
              }}
            />
          )}
        </Field>
        {supplier ? (
          <Switch checked={isActive} onCheckedChange={setIsActive} label="Activo" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
