import {
  useActiveOrders,
  useAreas,
  useHasPermission,
  useMoney,
  useTables,
  useTerminology,
} from '@karbon/client';
import { Permission, TableStatus, type TableDto } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  EmptyState,
  PageHeader,
  Spinner,
  TABLE_STATUS_META,
  tableStatusLabel,
  useNow,
} from '@karbon/ui';
import { elapsedLabel } from '@karbon/utils';
import { LayoutGridIcon, MapIcon, PlusIcon, ReceiptTextIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocalState } from '../../lib/use-local-state';
import { CELL, floorPlanSize } from './floor-geometry';
import { FloorPlan } from './floor-plan';
import { NewOrderDialog } from './new-order-dialog';
import { TableMap } from './table-map';
import { TablePanel } from './table-panel';

export default function TablesPage() {
  const tables = useTables();
  const areas = useAreas();
  const orders = useActiveOrders();
  const terms = useTerminology();
  const money = useMoney();
  const now = useNow();
  const canCreate = useHasPermission(Permission.ORDERS_CREATE);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [view, setView] = useLocalState<'plan' | 'cards'>('karbon.tables.view', 'plan');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState<{ table: TableDto | null } | null>(null);

  const allTables = (tables.data ?? []).filter((table) => table.isActive);
  const activeAreas = (areas.data ?? [])
    .filter((area) => area.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleAreas = areaId ? activeAreas.filter((area) => area.id === areaId) : activeAreas;
  const selected = allTables.find((table) => table.id === selectedId) ?? null;
  const looseOrders = (orders.data?.items ?? []).filter((order) => order.tableId === null);

  const counts = new Map<TableStatus, number>();
  for (const table of allTables) {
    if (!table.mergedIntoId) counts.set(table.status, (counts.get(table.status) ?? 0) + 1);
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Mesas"
        description={`${counts.get(TableStatus.FREE) ?? 0} libres de ${allTables.filter((table) => !table.mergedIntoId).length}`}
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setNewOrder({ table: null });
              }}
            >
              <PlusIcon /> {terms.mode === 'BAR' ? 'Nueva cuenta' : 'Pedido sin mesa'}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Áreas">
          <Chip
            role="tab"
            aria-selected={areaId === null}
            active={areaId === null}
            onClick={() => {
              setAreaId(null);
            }}
          >
            Todas
          </Chip>
          {activeAreas.map((area) => (
            <Chip
              key={area.id}
              role="tab"
              aria-selected={areaId === area.id}
              active={areaId === area.id}
              onClick={() => {
                setAreaId(area.id);
              }}
            >
              {area.name}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Vista">
          <Chip
            role="radio"
            aria-checked={view === 'plan'}
            active={view === 'plan'}
            onClick={() => {
              setView('plan');
            }}
          >
            <MapIcon className="size-4" /> Plano
          </Chip>
          <Chip
            role="radio"
            aria-checked={view === 'cards'}
            active={view === 'cards'}
            onClick={() => {
              setView('cards');
            }}
          >
            <LayoutGridIcon className="size-4" /> Tarjetas
          </Chip>
        </div>
        <ul
          className="flex flex-wrap gap-3 text-xs text-muted-foreground"
          aria-label="Leyenda de estados"
        >
          {Object.values(TableStatus).map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', TABLE_STATUS_META[status].dotClass)} />
              {tableStatusLabel(status, terms)} ({counts.get(status) ?? 0})
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          'flex gap-6 p-5',
          view === 'plan' ? 'flex-wrap items-start gap-x-8' : 'flex-col',
        )}
      >
        {tables.isPending ? <Spinner /> : null}
        {!tables.isPending && allTables.length === 0 ? (
          <EmptyState
            className="basis-full"
            icon={LayoutGridIcon}
            title="Aún no hay mesas"
            description="Créalas en Configuración → Salón."
          />
        ) : null}

        {visibleAreas.map((area) => {
          const areaTables = allTables.filter((table) => table.areaId === area.id);
          if (areaTables.length === 0) return null;
          // En el plano, las áreas pequeñas se acomodan lado a lado sin agrandarse.
          const planWidth = floorPlanSize([...areaTables, ...area.elements], false).cols * CELL;
          return (
            <section
              key={area.id}
              className="flex min-w-0 flex-col gap-3"
              style={view === 'plan' ? { width: `min(100%, ${String(planWidth)}px)` } : undefined}
            >
              {areaId === null ? <h2 className="font-semibold">{area.name}</h2> : null}
              {view === 'plan' ? (
                <FloorPlan
                  label={`Plano de ${area.name}`}
                  tables={areaTables}
                  elements={area.elements}
                  now={now}
                  selectedId={selectedId}
                  onSelectTable={(table) => {
                    setSelectedId(table.id);
                  }}
                />
              ) : (
                <TableMap
                  tables={areaTables}
                  now={now}
                  onSelect={(table) => {
                    setSelectedId(table.id);
                  }}
                />
              )}
            </section>
          );
        })}

        {looseOrders.length > 0 ? (
          <section className="flex basis-full flex-col gap-3">
            <h2 className="font-semibold">
              {terms.mode === 'BAR' ? 'Cuentas abiertas' : 'Pedidos sin mesa'}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
              {looseOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/pedidos/${order.id}`}
                  className="flex flex-col gap-1 rounded-xl border-2 border-status-occupied/60 bg-status-occupied/10 p-3 shadow-soft transition hover:shadow-elevated"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <ReceiptTextIcon className="size-4" />
                    {order.label ?? `Pedido #${order.number}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    #{order.number} · {order.waiter.name} · {elapsedLabel(order.createdAt, now)}
                  </span>
                  <span className="font-semibold tabular-nums">{money(order.total)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <TablePanel
        table={selected}
        tables={allTables}
        now={now}
        onClose={() => {
          setSelectedId(null);
        }}
        onOpenOrder={(table) => {
          setSelectedId(null);
          setNewOrder({ table });
        }}
      />
      {newOrder ? (
        <NewOrderDialog
          key={newOrder.table?.id ?? 'sin-mesa'}
          table={newOrder.table}
          open
          onOpenChange={(open) => {
            if (!open) setNewOrder(null);
          }}
        />
      ) : null}
    </div>
  );
}
