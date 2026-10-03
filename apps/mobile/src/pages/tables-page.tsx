import {
  NetworkError,
  newClientId,
  queryKeys,
  useActiveOrders,
  useApi,
  useApiMutation,
  useAreas,
  useHasPermission,
  useMoney,
  useSession,
  useTables,
  useTerminology,
} from '@karbon/client';
import { type OrderDto, OrderType, Permission, type TableDto, TableStatus } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  notifyError,
  Spinner,
  TABLE_STATUS_META,
  tableStatusLabel,
  toast,
  useNow,
} from '@karbon/ui';
import {
  elapsedLabel,
  mergedChildren,
  summarizePreparation,
  summarizeTable,
  type TableSummary,
} from '@karbon/utils';
import {
  BadgeCheckIcon,
  CalendarClockIcon,
  CircleIcon,
  DoorOpenIcon,
  HandPlatterIcon,
  HourglassIcon,
  LayoutGridIcon,
  Link2Icon,
  type LucideIcon,
  PlusIcon,
  ReceiptTextIcon,
  UsersIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PrepStatus } from '../components/prep-status';

const GUESTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

/** El estado se lee por el ícono y el texto, no solo por el color. */
const STATUS_ICON: Readonly<Record<TableStatus, LucideIcon>> = {
  FREE: CircleIcon,
  OCCUPIED: UsersIcon,
  WAITING_FOOD: HourglassIcon,
  WAITING_BILL: ReceiptTextIcon,
  PAID: BadgeCheckIcon,
  RESERVED: CalendarClockIcon,
};

type Focus = 'ready' | 'kitchen' | 'bill' | 'free';

interface SummarizedTable {
  table: TableDto;
  summary: TableSummary;
}

const FOCUS: readonly {
  id: Focus;
  label: string;
  icon: LucideIcon;
  matches: (entry: SummarizedTable) => boolean;
}[] = [
  {
    id: 'ready',
    label: 'Para recoger',
    icon: HandPlatterIcon,
    matches: ({ summary }) => summary.readyTickets > 0,
  },
  {
    id: 'kitchen',
    label: 'Preparando',
    icon: HourglassIcon,
    matches: ({ summary }) => summary.preparingSince !== null,
  },
  {
    id: 'bill',
    label: 'Cuenta',
    icon: ReceiptTextIcon,
    matches: ({ table }) => table.status === TableStatus.WAITING_BILL,
  },
  {
    id: 'free',
    label: 'Libres',
    icon: CircleIcon,
    matches: ({ table }) => table.status === TableStatus.FREE,
  },
];

/**
 * Mapa de mesas del mesero: de un vistazo qué hay que recoger, qué lleva mucho en cocina, quién
 * pidió la cuenta y qué está libre. Todo llega por tiempo real; el reloj solo corre si hay
 * algo preparándose.
 */
export function TablesPage() {
  const tables = useTables();
  const areas = useAreas();
  const orders = useActiveOrders();
  const session = useSession();
  const terms = useTerminology();
  const navigate = useNavigate();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [choosing, setChoosing] = useState<TableDto | null>(null);
  const api = useApi();
  const queryClient = useQueryClient();
  const canOperate = useHasPermission(Permission.TABLES_OPERATE);
  // Abrir la mesa crea su cuenta (aún sin productos): queda ocupada en todos los equipos y ya se
  // puede unir con otras. Sin conexión se sigue como antes: el carrito local la abre al enviar.
  const openTable = useApiMutation(
    ({ table, guests }: { table: TableDto; guests: number }) =>
      api.orders.create({ id: newClientId(), type: OrderType.DINE_IN, tableId: table.id, guests }),
    [queryKeys.tables, queryKeys.activeOrders],
    {
      onSuccess: (order) => {
        queryClient.setQueryData(queryKeys.order(order.id), order);
        setChoosing(null);
        void navigate(`/pedido/${order.id}/agregar`);
      },
      onError: (error, { table, guests }) => {
        if (error instanceof NetworkError) {
          setChoosing(null);
          void navigate(`/nuevo?mesa=${table.id}&personas=${String(guests)}`);
          return;
        }
        notifyError(error);
      },
    },
  );
  const release = useApiMutation(
    (tableId: string) => api.floor.setStatus(tableId, { status: 'FREE' }),
    [queryKeys.tables],
    {
      onSuccess: (table) => {
        toast.success(`${table.name} quedó libre`);
        setChoosing(null);
      },
      onError: notifyError,
    },
  );

  const myId = session?.user.id;
  const activeAreas = (areas.data ?? [])
    .filter((area) => area.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const areaIndex = new Map(activeAreas.map((area, index) => [area.id, index]));
  const areaOrder = (table: TableDto): number =>
    areaIndex.get(table.areaId) ?? Number.MAX_SAFE_INTEGER;

  // Área y "mis mesas" acotan el salón; los contadores de estado se calculan sobre eso.
  const scoped: SummarizedTable[] = (tables.data ?? [])
    .filter((table) => table.isActive && table.mergedIntoId === null)
    .filter((table) => areaId === null || table.areaId === areaId)
    .filter((table) => !mineOnly || table.activeOrders.some((order) => order.waiterId === myId))
    .sort((a, b) => areaOrder(a) - areaOrder(b) || a.posY - b.posY || a.posX - b.posX)
    .map((table) => ({ table, summary: summarizeTable(table) }));
  const focusDef = FOCUS.find((option) => option.id === focus);
  const visible = focusDef ? scoped.filter(focusDef.matches) : scoped;
  const looseOrders = (orders.data?.items ?? []).filter(
    (order) => order.tableId === null && (!mineOnly || order.waiter.id === myId),
  );

  const running =
    visible.some(({ summary }) => summary.preparingSince !== null) ||
    looseOrders.some((order) => summarizePreparation(order.tickets).preparingSince !== null);
  const now = useNow(running ? 1_000 : 30_000);

  const open = (table: TableDto): void => {
    const [first, ...rest] = table.activeOrders;
    if (first && rest.length === 0) void navigate(`/pedido/${first.id}`);
    else setChoosing(table);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Filtrar por estado">
        {FOCUS.map((option) => {
          const count = scoped.filter(option.matches).length;
          const active = focus === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFocus(active ? null : option.id);
              }}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border bg-card px-1 py-2 text-center shadow-soft transition active:scale-95',
                active && 'border-primary bg-primary text-primary-foreground',
                !active && option.id === 'ready' && count > 0 && 'border-primary',
              )}
            >
              <span className="flex items-center gap-1 text-xl leading-none font-bold tabular-nums">
                <option.icon className="size-4" aria-hidden />
                {count}
              </span>
              <span className="text-[0.7rem] leading-tight font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>

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
        {activeAreas.length > 1 ? (
          <>
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
          </>
        ) : null}
      </div>

      {tables.isPending ? <Spinner className="self-center p-6" /> : null}
      {!tables.isPending && visible.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title={
            focusDef
              ? `Nada en "${focusDef.label}"`
              : mineOnly
                ? 'No tienes mesas abiertas'
                : 'Sin mesas en esta área'
          }
          action={
            focus || mineOnly ? (
              <Button
                variant="outline"
                onClick={() => {
                  setFocus(null);
                  setMineOnly(false);
                }}
              >
                Ver todas las mesas
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {/* Dos columnas desde 320 px; en tablet, tarjetas más anchas para que la espera quepa. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] md:gap-3">
        {visible.map(({ table, summary }) => (
          <TableCard
            key={table.id}
            table={table}
            joined={mergedChildren(table, tables.data ?? []).map((child) => child.name)}
            summary={summary}
            now={now}
            myId={myId}
            onOpen={open}
          />
        ))}
      </div>

      {looseOrders.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {terms.mode === 'BAR' ? 'Cuentas abiertas' : 'Pedidos sin mesa'}
          </h2>
          {looseOrders.map((order) => (
            <LooseOrderCard key={order.id} order={order} now={now} />
          ))}
        </section>
      ) : null}

      <Button
        size="lg"
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 rounded-full shadow-elevated"
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
              <ChooseOrder table={choosing} />
            ) : (
              <>
                {canOperate &&
                (choosing.status === TableStatus.PAID ||
                  choosing.status === TableStatus.RESERVED) ? (
                  <Button
                    variant="secondary"
                    size="touch"
                    disabled={release.isPending}
                    onClick={() => {
                      release.mutate(choosing.id);
                    }}
                  >
                    <DoorOpenIcon /> Marcar libre
                  </Button>
                ) : null}
                <p className="text-sm font-medium">¿Cuántas personas?</p>
                <div className="grid grid-cols-4 gap-2">
                  {GUESTS.map((guests) => (
                    <Button
                      key={guests}
                      variant="outline"
                      size="touch"
                      disabled={openTable.isPending}
                      onClick={() => {
                        openTable.mutate({ table: choosing, guests });
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

function TableCard({
  table,
  joined,
  summary,
  now,
  myId,
  onOpen,
}: {
  table: TableDto;
  /** Mesas unidas a esta (se ocultan del mapa y se nombran aquí). */
  joined: readonly string[];
  summary: TableSummary;
  now: number;
  myId: string | undefined;
  onOpen: (table: TableDto) => void;
}) {
  const terms = useTerminology();
  const money = useMoney();
  const meta = TABLE_STATUS_META[table.status];
  const Icon = STATUS_ICON[table.status];
  const statusLabel = tableStatusLabel(table.status, terms);
  const waiters = [...new Set(table.activeOrders.map((order) => order.waiterName))];
  const mine = table.activeOrders.some((order) => order.waiterId === myId);
  const occupied = table.activeOrders.length > 0;

  return (
    <button
      type="button"
      onClick={() => {
        onOpen(table);
      }}
      aria-label={`${table.name}, ${statusLabel}${
        summary.readyTickets > 0 ? ', tiene comida lista para recoger' : ''
      }`}
      className={cn(
        'flex min-h-36 flex-col gap-2 rounded-2xl border-2 p-3 text-left shadow-soft transition active:scale-[0.97]',
        meta.surfaceClass,
        summary.readyTickets > 0 && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="text-xl leading-tight font-bold">{table.name}</span>
        {mine ? (
          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[0.65rem] font-semibold">
            Mía
          </span>
        ) : null}
      </span>
      {joined.length > 0 ? (
        <span className="-mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Link2Icon className="size-3.5" aria-hidden /> Unida con {joined.join(', ')}
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <span className={cn('grid size-5 place-items-center rounded-full', meta.dotClass)}>
          <Icon className="size-3 text-white" aria-hidden />
        </span>
        {statusLabel}
      </span>
      <PrepStatus summary={summary} now={now} />
      <span className="mt-auto flex items-end justify-between gap-1 text-xs text-muted-foreground">
        {occupied ? (
          <>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground tabular-nums">
                {money(summary.total)}
              </span>
              {!mine && waiters.length > 0 ? (
                <span className="block truncate">{waiters.join(', ')}</span>
              ) : null}
            </span>
            {summary.openedAt ? (
              <span className="shrink-0">{elapsedLabel(summary.openedAt, now)}</span>
            ) : null}
          </>
        ) : (
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3.5" aria-hidden /> {table.capacity} pers.
          </span>
        )}
      </span>
    </button>
  );
}

function LooseOrderCard({ order, now }: { order: OrderDto; now: number }) {
  const money = useMoney();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/pedido/${order.id}`);
      }}
      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-left shadow-soft active:scale-[0.99]"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{order.label ?? `Pedido #${String(order.number)}`}</span>
        <span className="text-xs text-muted-foreground">
          {order.waiter.name} · {elapsedLabel(order.createdAt, now)}
        </span>
        <PrepStatus summary={summarizePreparation(order.tickets)} now={now} />
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{money(order.total)}</span>
    </button>
  );
}

/** Mesa con varias cuentas (dividida o unida): se elige cuál abrir. */
function ChooseOrder({ table }: { table: TableDto }) {
  const money = useMoney();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2">
      {table.activeOrders.map((order) => (
        <Button
          key={order.id}
          variant="outline"
          size="touch"
          className="justify-between"
          onClick={() => {
            void navigate(`/pedido/${order.id}`);
          }}
        >
          <span className="flex flex-col items-start leading-tight">
            <span>Pedido #{order.number}</span>
            <span className="text-xs font-normal text-muted-foreground">{order.waiterName}</span>
          </span>
          <span className="tabular-nums">{money(order.total)}</span>
        </Button>
      ))}
    </div>
  );
}
