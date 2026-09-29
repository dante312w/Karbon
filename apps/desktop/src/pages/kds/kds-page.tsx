import {
  queryKeys,
  useApi,
  useApiMutation,
  useHasPermission,
  useKitchenTickets,
  useOrderAccess,
  useProducts,
  useSession,
  useStaffCallActions,
  useStaffCalls,
  useTerminology,
  useUrgencyThresholds,
} from '@karbon/client';
import {
  type KitchenStation,
  type KitchenTicketDto,
  KitchenTicketStatus,
  Permission,
  type StaffCallDto,
  StaffCallReason,
  StaffCallTarget,
} from '@karbon/types';
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  KITCHEN_TICKET_STATUS_LABEL,
  notifyError,
  Spinner,
  Switch,
  toast,
  useNow,
  playChime,
} from '@karbon/ui';
import {
  effectiveStation,
  enabledStations,
  outgoingStaffCalls,
  STATION_LABEL,
} from '@karbon/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  BellIcon,
  BellOffIcon,
  CircleSlashIcon,
  MaximizeIcon,
  MinimizeIcon,
  SoupIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime } from '../../lib/format';
import { useLocalState } from '../../lib/use-local-state';
import { TicketCard, type TicketCommand } from './ticket-card';

const COLUMNS = [
  KitchenTicketStatus.NEW,
  KitchenTicketStatus.PREPARING,
  KitchenTicketStatus.READY,
] as const;

/** Tablero de cocina o barra: comandas por estado, cronómetros con urgencia y aviso sonoro. */
export default function KdsPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const terms = useTerminology();
  const canUpdate = useHasPermission(Permission.KITCHEN_UPDATE);
  const access = useOrderAccess();
  const now = useNow(1_000);
  const stations = enabledStations(terms.mode);
  const [stationPref, setStationPref] = useLocalState<string>('karbon.kds.station', 'ALL');
  const [soundOn, setSoundOn] = useLocalState<boolean>('karbon.kds.sound', true);
  const [showDelivered, setShowDelivered] = useState(false);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const station = stations.includes(stationPref as KitchenStation)
    ? (stationPref as KitchenStation)
    : undefined;
  const tickets = useKitchenTickets(station);
  const thresholds = useUrgencyThresholds();

  // Aviso sonoro cuando llega una comanda que no estaba en pantalla. Al cambiar de estación
  // se vuelve a empezar: las comandas de la otra estación no son nuevas.
  const seen = useRef<{ station: KitchenStation | undefined; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!tickets.data) return;
    const last = seen.current;
    const previous = last !== null && last.station === station ? last.ids : null;
    const arrived =
      previous !== null &&
      tickets.data.some(
        (ticket) => ticket.status === KitchenTicketStatus.NEW && !previous.has(ticket.id),
      );
    if (arrived && soundOn) playChime('new');
    seen.current = { station, ids: new Set(tickets.data.map((ticket) => ticket.id)) };
  }, [tickets.data, station, soundOn]);

  useEffect(() => {
    const onChange = (): void => {
      setFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  // Cocina mueve la comanda por su ruta; la entrega (modo bar, caja) va por la del pedido.
  const runCommand = useApiMutation(
    async ({ ticket, command }: { ticket: KitchenTicketDto; command: TicketCommand }) => {
      if (command.kind === 'kitchen') return api.kitchen.setStatus(ticket.id, command.to);
      const order =
        command.kind === 'deliver'
          ? await api.orders.deliverTicket(ticket.orderId, ticket.id)
          : await api.orders.undeliverTicket(ticket.orderId, ticket.id);
      const updated = order.tickets.find((candidate) => candidate.id === ticket.id);
      if (!updated) throw new Error('La comanda ya no pertenece al pedido');
      return updated;
    },
    [],
    {
      onSuccess: (updated) => {
        queryClient.setQueriesData<KitchenTicketDto[]>({ queryKey: queryKeys.tickets }, (current) =>
          current?.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
        );
      },
      onError: (error) => {
        notifyError(error);
        void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      },
    },
  );
  // Llamar al mesero desde la comanda (dudas, "pasa por aquí"): se ve en la tarjeta si ya fue.
  const me = useSession()?.user.id ?? '';
  const canCallWaiter = useHasPermission(Permission.CALLS_WAITER);
  const staffCalls = useStaffCalls().data;
  const callActions = useStaffCallActions({ onError: notifyError });
  const callByOrder = useMemo(
    () =>
      new Map(
        outgoingStaffCalls(staffCalls ?? [], me)
          .filter((call): call is StaffCallDto & { orderId: string } => call.orderId !== null)
          .map((call) => [call.orderId, call]),
      ),
    [staffCalls, me],
  );
  const callWaiter = (ticket: KitchenTicketDto): void => {
    callActions.create.mutate(
      {
        target: StaffCallTarget.WAITER,
        reason: StaffCallReason.COME_OVER,
        orderId: ticket.orderId,
      },
      {
        onSuccess: (call) => {
          toast.success(
            call.callCount > 1
              ? `Se insistió a ${ticket.waiterName}`
              : `Llamaste a ${ticket.waiterName}`,
          );
        },
      },
    );
  };

  const cardProps = (ticket: KitchenTicketDto) => ({
    now,
    thresholds,
    canUpdate,
    canDeliver: access.canDeliver(ticket.waiterId),
    busy: runCommand.isPending && runCommand.variables.ticket.id === ticket.id,
    onCommand: (target: KitchenTicketDto, command: TicketCommand) => {
      runCommand.mutate({ ticket: target, command });
    },
    call: callByOrder.get(ticket.orderId) ?? null,
    ...(canCallWaiter
      ? {
          onCallWaiter: () => {
            callWaiter(ticket);
          },
        }
      : {}),
  });

  const all = tickets.data ?? [];
  const delivered = all
    .filter((ticket) => ticket.status === KitchenTicketStatus.DELIVERED)
    .reverse();
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boardRef.current?.requestFullscreen();
  };

  return (
    <div ref={boardRef} className="flex h-full flex-col bg-muted/40">
      <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2">
        <h1 className="text-lg font-bold">{terms.prepArea}</h1>
        {stations.length > 1 ? (
          <div className="flex gap-2" role="tablist" aria-label="Estación">
            <Chip
              role="tab"
              aria-selected={!station}
              active={!station}
              onClick={() => {
                setStationPref('ALL');
              }}
            >
              Todas
            </Chip>
            {stations.map((option) => (
              <Chip
                key={option}
                role="tab"
                aria-selected={station === option}
                active={station === option}
                onClick={() => {
                  setStationPref(option);
                }}
              >
                {STATION_LABEL[option]}
              </Chip>
            ))}
          </div>
        ) : null}
        <span className="ml-auto font-mono text-lg font-semibold tabular-nums">
          {formatTime(new Date(now).toISOString())}
        </span>
        {canUpdate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSoldOutOpen(true);
            }}
          >
            <CircleSlashIcon /> Agotados
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={soundOn ? 'Silenciar' : 'Activar sonido'}
          onClick={() => {
            setSoundOn(!soundOn);
            if (!soundOn) playChime('new');
          }}
        >
          {soundOn ? <BellIcon /> : <BellOffIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Pantalla completa"
          onClick={toggleFullscreen}
        >
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </header>

      {tickets.isPending ? <Spinner className="m-6" /> : null}

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-3">
        {COLUMNS.map((status) => {
          const column = all.filter((ticket) => ticket.status === status);
          return (
            <section
              key={status}
              className="flex min-h-0 flex-col gap-2"
              aria-label={KITCHEN_TICKET_STATUS_LABEL[status]}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {KITCHEN_TICKET_STATUS_LABEL[status]}
                <span className="rounded-full bg-background px-2 py-0.5 text-foreground tabular-nums">
                  {column.length}
                </span>
              </h2>
              {/* En pantallas anchas (TV) caben dos o más comandas por fila en cada columna. */}
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] content-start items-start gap-3 overflow-y-auto pb-2">
                {column.length === 0 && status === KitchenTicketStatus.NEW && !tickets.isPending ? (
                  <div className="col-span-full">
                    <EmptyState
                      icon={SoupIcon}
                      title="Sin comandas"
                      description={`Lo que se envíe ${terms.toPrepArea} aparece aquí.`}
                    />
                  </div>
                ) : null}
                {column.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    showStation={!station && stations.length > 1}
                    {...cardProps(ticket)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {delivered.length > 0 ? (
        <footer className="border-t bg-background px-4 py-2">
          <button
            type="button"
            className="text-sm font-medium text-muted-foreground"
            onClick={() => {
              setShowDelivered(!showDelivered);
            }}
          >
            {showDelivered ? 'Ocultar' : 'Ver'} entregados recientes ({delivered.length})
          </button>
          {showDelivered ? (
            <div className="mt-2 grid max-h-72 grid-cols-4 gap-3 overflow-y-auto">
              {delivered.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  showStation={false}
                  {...cardProps(ticket)}
                />
              ))}
            </div>
          ) : null}
        </footer>
      ) : null}

      {soldOutOpen ? (
        <SoldOutDialog
          station={station}
          onClose={() => {
            setSoldOutOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Marcar productos agotados ("86") desde el tablero: el POS y los celulares los bloquean al instante. */
function SoldOutDialog({
  station,
  onClose,
}: {
  station: KitchenStation | undefined;
  onClose: () => void;
}) {
  const api = useApi();
  const terms = useTerminology();
  const products = useProducts();
  const [search, setSearch] = useState('');
  const toggle = useApiMutation(
    ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.catalog.setAvailability(id, isAvailable),
    [queryKeys.products],
    { onError: notifyError },
  );
  const term = search.trim().toLowerCase();
  const list = (products.data ?? [])
    .filter((product) => product.isActive && product.sendToKitchen)
    .filter((product) => !station || effectiveStation(product.station, terms.mode) === station)
    .filter((product) => !term || product.name.toLowerCase().includes(term))
    .sort((a, b) => Number(a.isAvailable) - Number(b.isAvailable) || a.name.localeCompare(b.name));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        variant="side"
        title="Productos agotados"
        description="Apaga lo que ya no hay: deja de ofrecerse en caja y celulares."
      >
        <Input
          placeholder="Buscar producto"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <ul className="flex flex-col divide-y">
          {list.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 py-2">
              <span className={product.isAvailable ? '' : 'text-destructive'}>{product.name}</span>
              <Switch
                checked={product.isAvailable}
                label={product.isAvailable ? 'Disponible' : 'Agotado'}
                disabled={toggle.isPending}
                onCheckedChange={(isAvailable) => {
                  toggle.mutate({ id: product.id, isAvailable });
                }}
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
