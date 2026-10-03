import {
  queryKeys,
  useApi,
  useApiMutation,
  useHasPermission,
  useMergeTables,
  useMoney,
  useSession,
  useTerminology,
} from '@karbon/client';
import { Permission, TableStatus, type TableDto } from '@karbon/types';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  notifyError,
  TABLE_STATUS_META,
  tableStatusLabel,
  toast,
} from '@karbon/ui';
import { elapsedLabel, mergeCandidates, mergedChildren } from '@karbon/utils';
import {
  BellRingIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  DoorOpenIcon,
  Link2Icon,
  Link2OffIcon,
  PlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CallWaiterDialog } from '../../components/call-waiter-dialog';
import { ConfirmDialog } from '../../components/confirm-dialog';

/** El mesero que atiende la mesa, si es uno solo (con varias cuentas de distintos, ninguno). */
function tableWaiterId(table: TableDto): string | null {
  const waiters = new Set(table.activeOrders.map((order) => order.waiterId));
  return waiters.size === 1 ? ([...waiters][0] ?? null) : null;
}

/** Detalle de una mesa: sus cuentas abiertas y las operaciones de salón. */
export function TablePanel({
  table,
  tables,
  now,
  onClose,
  onOpenOrder,
}: {
  table: TableDto | null;
  tables: TableDto[];
  now: number;
  onClose: () => void;
  onOpenOrder: (table: TableDto) => void;
}) {
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const navigate = useNavigate();
  const canOperate = useHasPermission(Permission.TABLES_OPERATE);
  const canCreate = useHasPermission(Permission.ORDERS_CREATE);
  const canCallWaiter = useHasPermission(Permission.CALLS_WAITER);
  const session = useSession();
  const [merging, setMerging] = useState<string[] | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);

  const invalidate = [queryKeys.tables];
  const setStatus = useApiMutation(
    (status: 'FREE' | 'RESERVED') => api.floor.setStatus(table?.id ?? '', { status }),
    invalidate,
    { onError: notifyError, onSuccess: onClose },
  );
  const merge = useMergeTables(table?.id ?? '', {
    onError: notifyError,
    onSuccess: () => {
      toast.success('Mesas unidas');
      setMerging(null);
    },
  });
  const unmerge = useApiMutation(() => api.floor.unmerge(table?.id ?? ''), invalidate, {
    onError: notifyError,
    onSuccess: () => toast.success('Mesas separadas'),
  });

  if (!table) return null;
  const meta = TABLE_STATUS_META[table.status];
  const children = mergedChildren(table, tables);
  const candidates = session ? mergeCandidates(table, tables, session.user) : [];
  const hasOrders = table.activeOrders.length > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setMerging(null);
          onClose();
        }
      }}
    >
      <DialogContent
        variant="side"
        title={table.name}
        description={
          <span className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', meta.dotClass)} />
            {tableStatusLabel(table.status, terms)} · {table.capacity} puestos
            {children.length > 0
              ? ` · unida con ${children.map((child) => child.name).join(', ')}`
              : ''}
          </span>
        }
      >
        {merging ? (
          <section className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Elige las mesas que se unen a {table.name}, libres o abiertas: el grupo queda con una
              sola cuenta. Si varias ya tienen consumo, se confirma y sus cuentas quedan separadas.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((candidate) => {
                const checked = merging.includes(candidate.id);
                return (
                  <Button
                    key={candidate.id}
                    variant={checked ? 'default' : 'outline'}
                    size="lg"
                    aria-pressed={checked}
                    onClick={() => {
                      setMerging(
                        checked
                          ? merging.filter((id) => id !== candidate.id)
                          : [...merging, candidate.id],
                      );
                    }}
                  >
                    {candidate.name}
                    {candidate.activeOrders.length === 0
                      ? ''
                      : candidate.activeOrders.some((summary) => summary.total > 0)
                        ? ' · con consumo'
                        : ' · abierta'}
                  </Button>
                );
              })}
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay mesas que puedas unir en esta área.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMerging(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={merging.length === 0 || merge.isPending}
                onClick={() => {
                  merge.merge(merging);
                }}
              >
                Unir {merging.length > 0 ? `(${merging.length})` : ''}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Cuentas abiertas</h3>
              {hasOrders ? (
                table.activeOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    autoFocus={table.activeOrders.length === 1}
                    onClick={() => {
                      void navigate(`/pedidos/${order.id}`);
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-soft transition hover:bg-accent"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">
                        Pedido #{order.number}
                        {order.status === 'BILL_REQUESTED' ? (
                          <Badge variant="destructive" className="ml-2">
                            Cuenta pedida
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.waiterName} · {elapsedLabel(order.createdAt, now)}
                        {order.guests ? ` · ${order.guests} pers.` : ''}
                        {order.pendingTickets > 0
                          ? ` · ${order.pendingTickets} en ${terms.prepArea.toLowerCase()}`
                          : ''}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 font-semibold tabular-nums">
                      {money(order.total)}
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  La mesa no tiene cuentas abiertas.
                </p>
              )}
            </section>

            <section className="mt-auto flex flex-col gap-2">
              {canCallWaiter && hasOrders ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setCallingWaiter(true);
                  }}
                >
                  <BellRingIcon /> Llamar al mesero
                </Button>
              ) : null}
              {!hasOrders && canCreate ? (
                <Button
                  size="touch"
                  autoFocus
                  onClick={() => {
                    onOpenOrder(table);
                  }}
                >
                  <PlusIcon /> Abrir mesa
                </Button>
              ) : null}
              {canOperate &&
              !hasOrders &&
              (table.status === TableStatus.PAID || table.status === TableStatus.RESERVED) ? (
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={setStatus.isPending}
                  onClick={() => {
                    setStatus.mutate('FREE');
                  }}
                >
                  <DoorOpenIcon /> Liberar mesa
                </Button>
              ) : null}
              {canOperate && table.status === TableStatus.FREE ? (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={setStatus.isPending}
                  onClick={() => {
                    setStatus.mutate('RESERVED');
                  }}
                >
                  <CalendarClockIcon /> Marcar reservada
                </Button>
              ) : null}
              {canOperate ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setMerging([]);
                    }}
                  >
                    <Link2Icon /> Unir mesas
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={children.length === 0 || unmerge.isPending}
                    onClick={() => {
                      unmerge.mutate(undefined);
                    }}
                  >
                    <Link2OffIcon /> Separar
                  </Button>
                </div>
              ) : null}
            </section>
            {callingWaiter ? (
              <CallWaiterDialog
                place={{ tableId: table.id }}
                description={`${table.name} · ${[
                  ...new Set(table.activeOrders.map((order) => order.waiterName)),
                ].join(', ')}`}
                defaultWaiterId={tableWaiterId(table)}
                onClose={() => {
                  setCallingWaiter(false);
                }}
              />
            ) : null}
          </>
        )}
        <ConfirmDialog
          open={merge.pendingConfirmation !== null}
          onOpenChange={(open) => {
            if (!open) merge.dismiss();
          }}
          title="¿Unir con cuentas separadas?"
          description={`${merge.pendingConfirmation ?? ''}. Cada cuenta conserva sus productos y pagos y se cobra por separado.`}
          confirmLabel="Unir igual"
          onConfirm={() => {
            merge.confirm();
            return Promise.resolve();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
