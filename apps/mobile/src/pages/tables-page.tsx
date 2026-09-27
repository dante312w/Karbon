import {
  useActiveOrders,
  useAreas,
  useMoney,
  useSession,
  useTables,
  useTerminology,
} from '@karbon/client';
import type { TableDto } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Spinner,
  TABLE_STATUS_META,
  tableStatusLabel,
  useNow,
} from '@karbon/ui';
import { elapsedLabel } from '@karbon/utils';
import { LayoutGridIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

const GUESTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

export function TablesPage() {
  const tables = useTables();
  const areas = useAreas();
  const orders = useActiveOrders();
  const session = useSession();
  const terms = useTerminology();
  const money = useMoney();
  const now = useNow();
  const navigate = useNavigate();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [choosing, setChoosing] = useState<TableDto | null>(null);

  const all = (tables.data ?? []).filter((table) => table.isActive && table.mergedIntoId === null);
  const activeAreas = (areas.data ?? [])
    .filter((area) => area.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const myId = session?.user.id;
  const areaIndex = new Map(activeAreas.map((area, index) => [area.id, index]));
  const areaOrder = (table: TableDto): number =>
    areaIndex.get(table.areaId) ?? Number.MAX_SAFE_INTEGER;
  const visible = all
    .filter((table) => areaId === null || table.areaId === areaId)
    .filter((table) => !mineOnly || table.activeOrders.some((order) => order.waiterId === myId))
    .sort((a, b) => areaOrder(a) - areaOrder(b) || a.posY - b.posY || a.posX - b.posX);
  const looseOrders = (orders.data?.items ?? []).filter(
    (order) => order.tableId === null && (!mineOnly || order.waiter.id === myId),
  );

  const open = (table: TableDto): void => {
    const [first, ...rest] = table.activeOrders;
    if (first && rest.length === 0) void navigate(`/pedido/${first.id}`);
    else setChoosing(table);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
        <Chip
          active={mineOnly}
          aria-pressed={mineOnly}
          onClick={() => {
            setMineOnly(!mineOnly);
          }}
        >
          Mis mesas
        </Chip>
        <Chip
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
            active={areaId === area.id}
            onClick={() => {
              setAreaId(area.id);
            }}
          >
            {area.name}
          </Chip>
        ))}
      </div>

      {tables.isPending ? <Spinner className="self-center p-6" /> : null}
      {!tables.isPending && visible.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title={mineOnly ? 'No tienes mesas abiertas' : 'Sin mesas en esta área'}
        />
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {visible.map((table) => {
          const meta = TABLE_STATUS_META[table.status];
          const total = table.activeOrders.reduce((sum, order) => sum + order.total, 0);
          const oldest = table.activeOrders.map((order) => order.createdAt).sort()[0];
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => {
                open(table);
              }}
              className={cn(
                'flex min-h-24 flex-col justify-between rounded-2xl border-2 p-2.5 text-left shadow-soft active:scale-95',
                meta.surfaceClass,
              )}
            >
              <span className="flex items-start justify-between gap-1">
                <span className="text-lg leading-tight font-bold">{table.name}</span>
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', meta.dotClass)} />
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {tableStatusLabel(table.status, terms)}
              </span>
              {total > 0 ? (
                <span className="flex items-end justify-between gap-1 text-xs">
                  <span className="font-semibold tabular-nums">{money(total)}</span>
                  {oldest ? (
                    <span className="text-muted-foreground">{elapsedLabel(oldest, now)}</span>
                  ) : null}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <UsersIcon className="size-3" /> {table.capacity}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {looseOrders.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {terms.mode === 'BAR' ? 'Cuentas abiertas' : 'Pedidos sin mesa'}
          </h2>
          {looseOrders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => {
                void navigate(`/pedido/${order.id}`);
              }}
              className="flex items-center justify-between rounded-2xl border bg-card p-3 text-left shadow-soft"
            >
              <span>
                <span className="block font-semibold">
                  {order.label ?? `Pedido #${order.number}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {order.waiter.name} · {elapsedLabel(order.createdAt, now)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{money(order.total)}</span>
            </button>
          ))}
        </section>
      ) : null}

      <Button
        size="lg"
        className="fixed right-4 bottom-24 z-20 rounded-full shadow-elevated"
        onClick={() => {
          void navigate('/nuevo');
        }}
      >
        <PlusIcon /> {terms.mode === 'BAR' ? 'Nueva cuenta' : 'Sin mesa'}
      </Button>

      {choosing ? (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value) setChoosing(null);
          }}
        >
          <DialogContent
            title={choosing.name}
            description={tableStatusLabel(choosing.status, terms)}
          >
            {choosing.activeOrders.length > 0 ? (
              <div className="flex flex-col gap-2">
                {choosing.activeOrders.map((order) => (
                  <Button
                    key={order.id}
                    variant="outline"
                    size="lg"
                    className="justify-between"
                    onClick={() => {
                      void navigate(`/pedido/${order.id}`);
                    }}
                  >
                    <span>Pedido #{order.number}</span>
                    <span className="tabular-nums">{money(order.total)}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">¿Cuántas personas?</p>
                <div className="grid grid-cols-4 gap-2">
                  {GUESTS.map((guests) => (
                    <Button
                      key={guests}
                      variant="outline"
                      size="touch"
                      onClick={() => {
                        void navigate(`/nuevo?mesa=${choosing.id}&personas=${guests}`);
                      }}
                    >
                      {guests}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
