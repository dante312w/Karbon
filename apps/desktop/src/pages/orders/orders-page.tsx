import { queryKeys, useApi, useMoney } from '@karbon/client';
import type { OrderDto, OrderListQuery } from '@karbon/types';
import {
  Badge,
  type Column,
  DataTable,
  EmptyState,
  Input,
  ORDER_STATUS_LABEL,
  PageHeader,
  Pagination,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@karbon/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ReceiptTextIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime } from '../../lib/format';

type Status = NonNullable<OrderListQuery['status']>;
const PAGE_SIZE = 25;

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString('sv-SE');
}

/** Historial de pedidos: activos, pagados y cancelados con filtro por fechas. */
export default function OrdersPage() {
  const api = useApi();
  const money = useMoney();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [from, setFrom] = useState(localDate(-1));
  const [to, setTo] = useState(localDate());
  const [page, setPage] = useState(1);

  const query: OrderListQuery = {
    status,
    page,
    pageSize: PAGE_SIZE,
    ...(status === 'ACTIVE'
      ? {}
      : {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
        }),
  };
  const orders = useQuery({
    queryKey: [...queryKeys.orders, 'list', query],
    queryFn: () => api.orders.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: Column<OrderDto>[] = [
    {
      key: 'number',
      header: '#',
      cell: (order) => <span className="font-semibold">{order.number}</span>,
    },
    {
      key: 'place',
      header: 'Mesa / cuenta',
      cell: (order) => order.tableName ?? order.label ?? '—',
    },
    { key: 'waiter', header: 'Mesero', cell: (order) => order.waiter.name },
    {
      key: 'items',
      header: 'Productos',
      align: 'right',
      cell: (order) => order.items.filter((item) => item.status !== 'CANCELLED').length,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (order) => (
        <Badge
          variant={
            order.status === 'CANCELLED'
              ? 'destructive'
              : order.status === 'PAID'
                ? 'default'
                : 'secondary'
          }
        >
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Fecha',
      cell: (order) => formatDateTime(order.closedAt ?? order.createdAt),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (order) => <span className="tabular-nums">{money(order.total)}</span>,
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pedidos"
        description={orders.data ? `${orders.data.total} pedidos` : undefined}
      />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={status}
            onValueChange={(value) => {
              setStatus(value as Status);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="ACTIVE">Activos</TabsTrigger>
              <TabsTrigger value="PAID">Pagados</TabsTrigger>
              <TabsTrigger value="CANCELLED">Cancelados</TabsTrigger>
            </TabsList>
          </Tabs>
          {status === 'ACTIVE' ? null : (
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                Desde{' '}
                <Input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="flex items-center gap-2">
                Hasta{' '}
                <Input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {orders.isPending ? <Spinner /> : null}
        {orders.data ? (
          <DataTable
            columns={columns}
            rows={orders.data.items}
            rowKey={(order) => order.id}
            onRowClick={(order) => {
              void navigate(`/pedidos/${order.id}`);
            }}
            empty={
              <EmptyState
                icon={ReceiptTextIcon}
                title="No hay pedidos"
                description="Cambia el filtro o el rango de fechas."
              />
            }
          />
        ) : null}

        <Pagination
          page={page}
          total={orders.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </div>
    </div>
  );
}
