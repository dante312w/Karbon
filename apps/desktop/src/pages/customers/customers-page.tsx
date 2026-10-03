import { queryKeys, useApi, useApiMutation, useHasPermission, useMoney } from '@karbon/client';
import {
  type CreateCustomerRequest,
  type CustomerDto,
  IdentityDocumentType,
  Permission,
} from '@karbon/types';
import {
  Button,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Textarea,
  toast,
} from '@karbon/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { formatDate } from '../../lib/format';

const DOCUMENT_LABEL: Record<IdentityDocumentType, string> = {
  CC: 'Cédula de ciudadanía',
  NIT: 'NIT',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PASSPORT: 'Pasaporte',
  FOREIGN_ID: 'Documento extranjero',
};
const PAGE_SIZE = 25;

export default function CustomersPage() {
  const api = useApi();
  const money = useMoney();
  const canWrite = useHasPermission(Permission.CUSTOMERS_WRITE);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ customer: CustomerDto | null } | null>(null);
  const term = useDeferredValue(search.trim());
  const customers = useQuery({
    queryKey: [...queryKeys.customers, 'list', term, page],
    queryFn: () =>
      api.customers.list({ page, pageSize: PAGE_SIZE, ...(term ? { search: term } : {}) }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<CustomerDto>[] = [
    {
      key: 'name',
      header: 'Cliente',
      cell: (customer) => (
        <span className="flex flex-col">
          <span className="font-medium">{customer.name}</span>
          <span className="text-xs text-muted-foreground">
            {[customer.documentNumber, customer.email].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    { key: 'phone', header: 'Teléfono', cell: (customer) => customer.phone ?? '—' },
    { key: 'visits', header: 'Visitas', align: 'right', cell: (customer) => customer.visitsCount },
    {
      key: 'spent',
      header: 'Consumo total',
      align: 'right',
      cell: (customer) => money(customer.totalSpent),
    },
    {
      key: 'last',
      header: 'Última visita',
      cell: (customer) => (customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '—'),
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Clientes"
        description={customers.data ? `${customers.data.total} registrados` : undefined}
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing({ customer: null });
              }}
            >
              <PlusIcon /> Nuevo cliente
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 p-5">
        <label className="relative max-w-md">
          <span className="sr-only">Buscar cliente</span>
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Nombre, documento o teléfono"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {customers.isPending ? <Spinner /> : null}
        {customers.data ? (
          <DataTable
            columns={columns}
            rows={customers.data.items}
            rowKey={(customer) => customer.id}
            onRowClick={(customer) => {
              setEditing({ customer });
            }}
            empty={
              <EmptyState
                icon={UsersIcon}
                title="Sin clientes"
                description="Regístralos para facturar a su nombre y ver su historial."
              />
            }
          />
        ) : null}
        <Pagination
          page={page}
          total={customers.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </div>
      {editing ? (
        <CustomerDialog
          customer={editing.customer}
          readOnly={!canWrite}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomerDialog({
  customer,
  readOnly,
  onClose,
}: {
  customer: CustomerDto | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const api = useApi();
  const money = useMoney();
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    documentType: customer?.documentType ?? '',
    documentNumber: customer?.documentNumber ?? '',
    birthday: customer?.birthday ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
  });
  const set = (key: keyof typeof form, value: string): void => {
    setForm({ ...form, [key]: value });
  };
  const history = useQuery({
    queryKey: [...queryKeys.customers, 'history', customer?.id ?? ''],
    queryFn: () => api.customers.history(customer?.id ?? ''),
    enabled: customer !== null,
  });
  const save = useApiMutation(
    () => {
      const optional = (value: string): string | null => value.trim() || null;
      const body: CreateCustomerRequest = {
        name: form.name.trim(),
        phone: optional(form.phone),
        email: optional(form.email),
        documentType: (form.documentType || null) as IdentityDocumentType | null,
        documentNumber: optional(form.documentNumber),
        birthday: optional(form.birthday),
        address: optional(form.address),
        notes: optional(form.notes),
      };
      return customer ? api.customers.update(customer.id, body) : api.customers.create(body);
    },
    [queryKeys.customers],
    {
      onSuccess: () => {
        toast.success('Cliente guardado');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useApiMutation(
    () => api.customers.remove(customer?.id ?? ''),
    [queryKeys.customers],
    { onSuccess: onClose },
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,44rem)]"
        title={customer ? customer.name : 'Nuevo cliente'}
        {...(customer
          ? {
              description: `${customer.visitsCount} visitas · ${money(customer.totalSpent)} en consumo`,
            }
          : {})}
        footer={
          readOnly ? null : (
            <>
              {customer ? (
                <Button
                  variant="ghost"
                  className="mr-auto text-destructive"
                  onClick={() => {
                    setRemoving(true);
                  }}
                >
                  <Trash2Icon /> Eliminar
                </Button>
              ) : null}
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={form.name.trim().length < 2 || save.isPending}
                onClick={() => {
                  save.mutate(undefined);
                }}
              >
                Guardar
              </Button>
            </>
          )
        }
      >
        <fieldset disabled={readOnly} className="grid grid-cols-2 gap-3">
          <Field label="Nombre completo" className="col-span-2">
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
          <Field label="Tipo de documento">
            {(id) => (
              <Select
                id={id}
                value={form.documentType}
                onChange={(event) => {
                  set('documentType', event.target.value);
                }}
              >
                <option value="">Sin documento</option>
                {Object.values(IdentityDocumentType).map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_LABEL[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Número de documento">
            {(id) => (
              <Input
                id={id}
                value={form.documentNumber}
                onChange={(event) => {
                  set('documentNumber', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Teléfono">
            {(id) => (
              <Input
                id={id}
                type="tel"
                value={form.phone}
                onChange={(event) => {
                  set('phone', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Correo">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={form.email}
                onChange={(event) => {
                  set('email', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Cumpleaños">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.birthday}
                onChange={(event) => {
                  set('birthday', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Dirección">
            {(id) => (
              <Input
                id={id}
                value={form.address}
                onChange={(event) => {
                  set('address', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Notas (preferencias, alergias…)" className="col-span-2">
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
        </fieldset>
        {customer ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Historial de consumo</h3>
            {(history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos asociados.</p>
            ) : null}
            <ul className="flex flex-col divide-y rounded-lg border text-sm">
              {(history.data ?? []).map((entry) => (
                <li key={entry.orderId}>
                  <Link
                    to={`/pedidos/${entry.orderId}`}
                    className="flex justify-between gap-2 px-3 py-2 hover:bg-accent"
                  >
                    <span>
                      #{entry.number} · {entry.closedAt ? formatDate(entry.closedAt) : 'abierto'} ·{' '}
                      {entry.items} productos
                    </span>
                    <span className="tabular-nums">{money(entry.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title="Eliminar cliente"
          description="Sus pedidos anteriores se conservan, sin el vínculo al cliente."
          confirmLabel="Eliminar"
          destructive
          onConfirm={() => remove.mutateAsync(undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}
