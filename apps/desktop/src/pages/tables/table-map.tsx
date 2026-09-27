import { useMoney, useTerminology } from '@karbon/client';
import { type TableDto, TableShape } from '@karbon/types';
import { cn, TABLE_STATUS_META, tableStatusLabel } from '@karbon/ui';
import { elapsedLabel } from '@karbon/utils';
import { ChefHatIcon, Link2Icon, MartiniIcon, UsersIcon } from 'lucide-react';

const OCCUPIED_TRACK = 'minmax(7.5rem, 1fr)';
const AISLE_TRACK = '1rem';

/**
 * Pistas de la grilla: las columnas/filas con mesas son anchas y los pasillos vacíos angostos,
 * así el plano respeta las posiciones relativas sin desperdiciar pantalla.
 */
function tracks(tables: TableDto[], axis: 'x' | 'y'): string {
  const occupied = new Set<number>();
  let size = 0;
  for (const table of tables) {
    const start = axis === 'x' ? table.posX : table.posY;
    const span = axis === 'x' ? table.width : table.height;
    for (let index = start; index < start + span; index += 1) occupied.add(index);
    size = Math.max(size, start + span);
  }
  return Array.from({ length: size }, (_, index) =>
    occupied.has(index) ? OCCUPIED_TRACK : AISLE_TRACK,
  ).join(' ');
}

export function TableMap({
  tables,
  now,
  onSelect,
}: {
  tables: TableDto[];
  now: number;
  onSelect: (table: TableDto) => void;
}) {
  const byId = new Map(tables.map((table) => [table.id, table]));
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: tracks(tables, 'x'), gridTemplateRows: tracks(tables, 'y') }}
    >
      {tables.map((table) => (
        <TableCard
          key={table.id}
          table={table}
          mergedInto={table.mergedIntoId ? (byId.get(table.mergedIntoId) ?? null) : null}
          now={now}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TableCard({
  table,
  mergedInto,
  now,
  onSelect,
}: {
  table: TableDto;
  mergedInto: TableDto | null;
  now: number;
  onSelect: (table: TableDto) => void;
}) {
  const money = useMoney();
  const terms = useTerminology();
  const meta = TABLE_STATUS_META[table.status];
  const total = table.activeOrders.reduce((sum, order) => sum + order.total, 0);
  const guests = table.activeOrders.reduce((sum, order) => sum + (order.guests ?? 0), 0);
  const pendingTickets = table.activeOrders.reduce((sum, order) => sum + order.pendingTickets, 0);
  const oldest = table.activeOrders.map((order) => order.createdAt).sort()[0];
  const PrepIcon = terms.mode === 'BAR' ? MartiniIcon : ChefHatIcon;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(mergedInto ?? table);
      }}
      style={{
        gridColumn: `${table.posX + 1} / span ${table.width}`,
        gridRow: `${table.posY + 1} / span ${table.height}`,
      }}
      className={cn(
        'relative flex min-h-28 flex-col justify-between gap-1 border-2 p-3 text-left shadow-soft transition hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]',
        table.shape === TableShape.ROUND ? 'rounded-[1.75rem]' : 'rounded-xl',
        meta.surfaceClass,
        mergedInto && 'border-dashed opacity-80',
      )}
      aria-label={`${table.name}: ${tableStatusLabel(table.status, terms)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xl leading-none font-bold">{table.name}</span>
        <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', meta.dotClass)} />
      </div>
      {mergedInto ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link2Icon className="size-3" /> Unida a {mergedInto.name}
        </span>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">
          {tableStatusLabel(table.status, terms)}
        </span>
      )}
      <div className="flex items-end justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <UsersIcon className="size-3.5" />
          {guests > 0 ? `${guests}/${table.capacity}` : table.capacity}
        </span>
        {oldest ? (
          <span className="text-muted-foreground tabular-nums">{elapsedLabel(oldest, now)}</span>
        ) : null}
      </div>
      {total > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums">{money(total)}</span>
          {pendingTickets > 0 ? (
            <span className="flex items-center gap-0.5 rounded-full bg-status-waiting-food px-1.5 text-[11px] font-semibold text-black">
              <PrepIcon className="size-3" />
              {pendingTickets}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
