import { queryKeys, useApi, useHasPermission, useMoney } from '@karbon/client';
import { type AuditLogDto, Permission, TableStatus } from '@karbon/types';
import {
  type Column,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  Select,
  Spinner,
  TABLE_STATUS_META,
} from '@karbon/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { Section } from './section';

const ENTITY_LABEL: Record<string, string> = {
  order: 'Pedidos',
  payment: 'Pagos',
  invoice: 'Facturas',
  cash_session: 'Caja',
  expense: 'Gastos',
  product: 'Productos',
  category: 'Categorías',
  table: 'Mesas',
  ingredient: 'Insumos',
  purchase: 'Compras',
  user: 'Usuarios',
  role: 'Roles',
  tax: 'Impuestos',
  numbering_range: 'Numeración',
  restaurant_settings: 'Configuración',
  settings: 'Instalación',
  license: 'Licencia',
  backup: 'Respaldos',
  refresh_token: 'Sesiones',
};

const ACTION_LABEL: Record<string, string> = {
  'order.cancel': 'Pedido anulado',
  'order.item_cancel': 'Ítem anulado',
  'order.discount': 'Descuento aplicado',
  'order.move': 'Pedido movido de mesa',
  'order.split': 'Cuenta dividida',
  'order.auto_deliver': 'Entregas cerradas al cobrar',
  'payment.void': 'Pago anulado',
  'invoice.issue': 'Factura emitida',
  'invoice.void': 'Factura anulada',
  'cash.open': 'Caja abierta',
  'cash.close': 'Caja cerrada',
  'cash.income': 'Ingreso de efectivo',
  'cash.withdrawal': 'Retiro de efectivo',
  'expense.delete': 'Gasto eliminado',
  'product.create': 'Producto creado',
  'product.update': 'Producto modificado',
  'product.delete': 'Producto eliminado',
  'product.recipe': 'Receta modificada',
  'category.delete': 'Categoría eliminada',
  'table.status': 'Estado de mesa cambiado',
  'table.merge': 'Mesas unidas',
  'table.unmerge': 'Mesas separadas',
  'table.delete': 'Mesa eliminada',
  'ingredient.delete': 'Insumo eliminado',
  'purchase.receive': 'Compra recibida',
  'purchase.cancel': 'Compra anulada',
  'user.create': 'Usuario creado',
  'user.update': 'Usuario modificado',
  'user.delete': 'Usuario eliminado',
  'role.create': 'Rol creado',
  'role.update': 'Rol modificado',
  'role.delete': 'Rol eliminado',
  'tax.create': 'Impuesto creado',
  'tax.update': 'Impuesto modificado',
  'numbering.create': 'Numeración creada',
  'settings.update': 'Configuración modificada',
  'settings.logo': 'Logo cambiado',
  'setup.complete': 'Instalación completada',
  'license.activate': 'Licencia activada',
  'backup.create': 'Respaldo manual',
  'auth.refresh_reuse_detected': 'Sesión robada o duplicada bloqueada',
};

const KEY_LABEL: Record<string, string> = {
  reason: 'Motivo',
  amount: 'Monto',
  openingAmount: 'Base',
  expected: 'Esperado',
  counted: 'Contado',
  discount: 'Descuento',
  price: 'Precio',
  description: 'Descripción',
  product: 'Producto',
  quantity: 'Cantidad',
  number: 'Número',
  status: 'Estado',
  lines: 'Líneas',
  fields: 'Campos',
  permissions: 'Permisos',
  businessMode: 'Modo',
  demoData: 'Datos demo',
  licensee: 'Titular',
  plan: 'Plan',
  expiresAt: 'Vence',
  name: 'Nombre',
  rate: 'Tarifa (%)',
  tickets: 'Comandas',
};

/** La bitácora guarda los montos en unidades menores, como el resto de la API. */
const MONEY_KEYS = new Set(['amount', 'openingAmount', 'expected', 'counted', 'discount', 'price']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

const PAGE_SIZE = 30;

const isTableStatus = (value: unknown): value is TableStatus =>
  Object.values<unknown>(TableStatus).includes(value);

function describeValue(key: string, value: unknown, money: (amount: number) => string): string {
  if (typeof value === 'number' && MONEY_KEYS.has(key)) return money(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (key === 'status' && isTableStatus(value)) return TABLE_STATUS_META[value].label;
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDateTime(value);
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/**
 * Resumen legible de los datos extra de un registro (`Motivo: … · Monto: …`). Los
 * identificadores internos se omiten: el módulo y la fecha ya ubican el registro.
 */
function describeMetadata(metadata: unknown, money: (amount: number) => string): string {
  if (metadata === null || typeof metadata !== 'object') return '';
  const isId = (value: unknown): boolean =>
    (typeof value === 'string' && UUID.test(value)) ||
    (Array.isArray(value) && value.length > 0 && value.every(isId));
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && !isId(value))
    .map(([key, value]) => `${KEY_LABEL[key] ?? key}: ${describeValue(key, value, money)}`)
    .join(' · ');
}

/** Bitácora de acciones sensibles: anulaciones, cierres de caja, cambios de permisos… */
export function AuditSection() {
  const api = useApi();
  const canUsers = useHasPermission(Permission.USERS_READ);
  const money = useMoney();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const term = useDeferredValue(search.trim());
  const users = useQuery({ queryKey: queryKeys.users, queryFn: api.users.list, enabled: canUsers });
  const query = {
    page,
    pageSize: PAGE_SIZE,
    ...(term ? { search: term } : {}),
    ...(entity ? { entity } : {}),
    ...(userId ? { userId } : {}),
  };
  const logs = useQuery({
    queryKey: [...queryKeys.system, 'audit', query],
    queryFn: () => api.system.auditLogs(query),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditLogDto>[] = [
    {
      key: 'date',
      header: 'Fecha',
      cell: (entry) => <span className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</span>,
    },
    { key: 'user', header: 'Usuario', cell: (entry) => entry.userName ?? 'Sistema' },
    {
      key: 'action',
      header: 'Acción',
      cell: (entry) => ACTION_LABEL[entry.action] ?? entry.action,
    },
    {
      key: 'detail',
      header: 'Detalle',
      cell: (entry) => {
        const detail = describeMetadata(entry.metadata, money);
        return (
          <span className="line-clamp-2 text-muted-foreground" title={detail}>
            {detail}
          </span>
        );
      },
    },
  ];

  return (
    <Section
      title="Auditoría"
      description="Quién anuló, descontó, cerró caja o cambió permisos, y cuándo. Los registros no se pueden editar."
    >
      <div className="flex flex-wrap gap-2">
        <label className="relative w-64">
          <span className="sr-only">Buscar acción</span>
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar acción (p. ej. cancel)"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          className="w-48"
          aria-label="Módulo"
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los módulos</option>
          {Object.entries(ENTITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {canUsers ? (
          <Select
            className="w-48"
            aria-label="Usuario"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los usuarios</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {logs.isPending ? <Spinner /> : null}
      {logs.data ? (
        <DataTable
          columns={columns}
          rows={logs.data.items}
          rowKey={(entry) => entry.id}
          empty={<EmptyState icon={ShieldCheckIcon} title="Sin registros" />}
        />
      ) : null}
      <Pagination page={page} total={logs.data?.total ?? 0} pageSize={PAGE_SIZE} onPage={setPage} />
    </Section>
  );
}
