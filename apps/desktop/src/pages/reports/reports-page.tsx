import { useDashboard, useMoney, useSettings } from '@karbon/client';
import type { DashboardDto } from '@karbon/types';
import { Button, Chip, Input, PageHeader, Spinner, StatCard } from '@karbon/ui';
import { fromMinorUnits, PAYMENT_METHOD_LABEL } from '@karbon/utils';
import {
  AlertTriangleIcon,
  DownloadIcon,
  HandCoinsIcon,
  ReceiptIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downloadCsv } from '../../lib/csv';
import { formatQuantity, localIsoDate, unitLabel } from '../../lib/format';

/** Series de los gráficos (tokens de `@karbon/ui`, con su versión para tema oscuro). */
const PALETTE = Array.from({ length: 8 }, (_, index) => `var(--chart-${String(index + 1)})`);

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = new Date();
  const days = (offset: number): Date =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  switch (preset) {
    case 'today':
      return { from: localIsoDate(today), to: localIsoDate(today) };
    case 'yesterday':
      return { from: localIsoDate(days(-1)), to: localIsoDate(days(-1)) };
    case 'week':
      return { from: localIsoDate(days(-6)), to: localIsoDate(today) };
    case 'month':
      return {
        from: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: localIsoDate(today),
      };
    case 'lastMonth':
      return {
        from: localIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

const PRESET_LABEL: Record<Exclude<Preset, 'custom'>, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
  month: 'Este mes',
  lastMonth: 'Mes anterior',
};

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState(presetRange('today'));
  const dashboard = useDashboard(range);
  const money = useMoney();
  const currency = useSettings().data?.currency ?? 'COP';
  const data = dashboard.data;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Reportes"
        description="Ventas, utilidad e indicadores del negocio"
        actions={data ? <ExportButton data={data} /> : null}
      />
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PRESET_LABEL) as Exclude<Preset, 'custom'>[]).map((option) => (
            <Chip
              key={option}
              active={preset === option}
              onClick={() => {
                setPreset(option);
                setRange(presetRange(option));
              }}
            >
              {PRESET_LABEL[option]}
            </Chip>
          ))}
          <span className="ml-2 flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="Desde"
              value={range.from}
              max={range.to}
              onChange={(event) => {
                setPreset('custom');
                setRange({ ...range, from: event.target.value });
              }}
            />
            –
            <Input
              type="date"
              aria-label="Hasta"
              value={range.to}
              min={range.from}
              onChange={(event) => {
                setPreset('custom');
                setRange({ ...range, to: event.target.value });
              }}
            />
          </span>
        </div>

        {dashboard.isPending ? <Spinner /> : null}
        {data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Ventas"
                value={money(data.salesTotal)}
                icon={WalletIcon}
                hint={`${data.ordersCount} pedidos`}
              />
              <StatCard
                label="Ticket promedio"
                value={money(data.averageTicket)}
                icon={ReceiptIcon}
                hint={`${data.guests} comensales`}
              />
              <StatCard
                label="Utilidad estimada"
                value={money(data.profit)}
                icon={TrendingUpIcon}
                tone={data.profit >= 0 ? 'positive' : 'negative'}
                hint={`Costo ${money(data.costOfSales)} · Gastos ${money(data.expensesTotal)}`}
              />
              <StatCard label="Propinas" value={money(data.tipsTotal)} icon={HandCoinsIcon} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <ChartCard title="Ventas por día">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={data.salesByDay.map((row) => ({
                      ...row,
                      value: fromMinorUnits(row.total, currency),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={70} />
                    <Tooltip
                      formatter={(_value, _name, item) =>
                        money((item.payload as { total: number }).total)
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="Ventas"
                      stroke={PALETTE[0]}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Ventas por hora">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={data.salesByHour.map((row) => ({
                      ...row,
                      label: `${row.hour}:00`,
                      value: fromMinorUnits(row.total, currency),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={70} />
                    <Tooltip
                      formatter={(_value, _name, item) =>
                        money((item.payload as { total: number }).total)
                      }
                    />
                    <Bar dataKey="value" name="Ventas" fill={PALETTE[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Ventas por categoría">
                <PieBreakdown
                  rows={data.salesByCategory.map((row) => ({ name: row.name, total: row.total }))}
                  money={money}
                />
              </ChartCard>
              <ChartCard title="Métodos de pago">
                <PieBreakdown
                  rows={data.paymentsByMethod.map((row) => ({
                    name: PAYMENT_METHOD_LABEL[row.method],
                    total: row.total,
                  }))}
                  money={money}
                />
              </ChartCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <ChartCard title="Productos más vendidos">
                <RankTable
                  rows={data.topProducts.map((row) => ({
                    key: row.productId,
                    label: row.name,
                    detail: `${row.quantity} und`,
                    total: row.total,
                  }))}
                  money={money}
                />
              </ChartCard>
              <ChartCard title="Ventas por mesero">
                <RankTable
                  rows={data.salesByWaiter.map((row) => ({
                    key: row.waiterId,
                    label: row.name,
                    detail: `${row.orders} pedidos`,
                    total: row.total,
                  }))}
                  money={money}
                />
              </ChartCard>
              <ChartCard title="Inventario crítico">
                {data.criticalInventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ningún insumo bajo el mínimo.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {data.criticalInventory.map((row) => (
                      <li
                        key={row.ingredientId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2">
                          <AlertTriangleIcon className="size-4 text-destructive" /> {row.name}
                        </span>
                        <span className="tabular-nums">
                          {formatQuantity(row.stock)} / {formatQuantity(row.minStock)}{' '}
                          {unitLabel(row.unit)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PieBreakdown({
  rows,
  money,
}: {
  rows: { name: string; total: number }[];
  money: (amount: number) => string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>;
  // Cada porción conserva su color: más de 8 se agrupan en "Otros" en lugar de repetir colores.
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const slices =
    sorted.length <= PALETTE.length
      ? sorted
      : [
          ...sorted.slice(0, PALETTE.length - 1),
          {
            name: 'Otros',
            total: sorted.slice(PALETTE.length - 1).reduce((sum, row) => sum + row.total, 0),
          },
        ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={slices.map((row, index) => ({ ...row, fill: PALETTE[index] }))}
          dataKey="total"
          nameKey="name"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke="var(--card)"
        />
        <Tooltip formatter={(value) => money(Number(value))} />
        {/* El color identifica la porción en el ícono; el texto conserva el color de lectura. */}
        <Legend formatter={(value: string) => <span className="text-foreground">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RankTable({
  rows,
  money,
}: {
  rows: { key: string; label: string; detail: string; total: number }[];
  money: (amount: number) => string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {rows.map((row, index) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex justify-between gap-2">
            <span>
              <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
              {row.label} <span className="text-xs text-muted-foreground">· {row.detail}</span>
            </span>
            <span className="font-semibold tabular-nums">{money(row.total)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(row.total / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ExportButton({ data }: { data: DashboardDto }) {
  const currency = useSettings().data?.currency ?? 'COP';
  const major = (amount: number): number => fromMinorUnits(amount, currency);
  return (
    <Button
      variant="outline"
      onClick={() => {
        downloadCsv(
          `ventas-${data.from}-a-${data.to}.csv`,
          ['Tipo', 'Concepto', 'Cantidad', 'Total'],
          [
            ...data.salesByDay.map((row) => ['Día', row.date, row.orders, major(row.total)]),
            ...data.topProducts.map((row) => [
              'Producto',
              row.name,
              row.quantity,
              major(row.total),
            ]),
            ...data.salesByCategory.map((row) => ['Categoría', row.name, null, major(row.total)]),
            ...data.salesByWaiter.map((row) => ['Mesero', row.name, row.orders, major(row.total)]),
            ...data.paymentsByMethod.map((row) => [
              'Método de pago',
              PAYMENT_METHOD_LABEL[row.method],
              null,
              major(row.total),
            ]),
          ],
        );
      }}
    >
      <DownloadIcon /> Exportar CSV
    </Button>
  );
}
