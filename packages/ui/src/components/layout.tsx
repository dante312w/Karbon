import { Loader2Icon, type LucideIcon } from 'lucide-react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Spinner({
  className,
  label = 'Cargando…',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}
    >
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 p-10 text-center', className)}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {Icon ? <Icon className="size-4" /> : null}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint ? (
        <div
          className={cn(
            'text-xs',
            tone === 'positive' && 'text-status-free',
            tone === 'negative' && 'text-destructive',
            tone === 'default' && 'text-muted-foreground',
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-soft',
        className,
      )}
      {...props}
    />
  );
}

/** Pastilla seleccionable (categorías, áreas, filtros). */
export function Chip({
  active,
  className,
  ...props
}: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'bg-background hover:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

/** Tabla de datos simple y reutilizable para las vistas tipo ERP. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const alignment = (align: Column<T>['align']): string =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn('px-3 py-2 font-medium', alignment(column.align), column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row);
                    }
                  : undefined
              }
              className={cn(
                'border-t',
                onRowClick && 'cursor-pointer hover:bg-accent/60',
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('px-3 py-2', alignment(column.align), column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Paginación simple para las tablas del ERP. No se muestra si todo cabe en una página. */
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const button =
    'h-8 rounded-lg border bg-background px-3 text-xs font-semibold hover:bg-accent disabled:opacity-50';
  return (
    <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Paginación">
      <button
        type="button"
        className={button}
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        type="button"
        className={button}
        disabled={page >= pages}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        Siguiente
      </button>
    </nav>
  );
}
