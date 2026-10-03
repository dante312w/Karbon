import {
  staffCallToastId,
  useSession,
  useMarkStaffCallsSeen,
  useStaffCallActions,
  useStaffCallAlerts,
  useStaffCalls,
} from '@karbon/client';
import {
  type StaffCallDto,
  StaffCallReason,
  StaffCallStatus,
  StaffCallTarget,
} from '@karbon/types';
import {
  Button,
  Dialog,
  DialogContent,
  notifyError,
  playChime,
  StaffCallCard,
  toast,
  useNow,
} from '@karbon/ui';
import {
  canAnswerStaffCall,
  canCreateStaffCall,
  incomingStaffCalls,
  outgoingStaffCalls,
  STAFF_CALL_REASON_LABEL,
  staffCallPlace,
  staffCallStatusText,
  staffCallTitle,
} from '@karbon/utils';
import { BellIcon, BellRingIcon } from 'lucide-react';
import { useState } from 'react';
import { CallWaiterDialog } from './call-waiter-dialog';

/**
 * Llamados en el escritorio: caja recibe los de los meseros (con sonido) y cocina, barra o caja
 * siguen los que hicieron. También permite llamar a un mesero o a todos.
 */
export function StaffCallsBell() {
  const session = useSession();
  const permissions = session?.user.permissions ?? [];
  const calls = useStaffCalls().data ?? [];
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const actions = useStaffCallActions({ onError: notifyError });
  const answersCashier = canAnswerStaffCall(StaffCallTarget.CASHIER, permissions);
  const callsWaiters = canCreateStaffCall(StaffCallTarget.WAITER, permissions);
  const incoming = session ? incomingStaffCalls(calls, StaffCallTarget.CASHIER, session.user) : [];
  const outgoing = session ? outgoingStaffCalls(calls, session.user.id) : [];
  const pending = incoming.filter((call) => call.status === StaffCallStatus.PENDING).length;

  useMarkStaffCallsSeen(StaffCallTarget.CASHIER);
  useStaffCallAlerts(StaffCallTarget.CASHIER, {
    onIncoming: (call) => {
      playChime('call');
      toast(staffCallTitle(call), {
        id: staffCallToastId(call),
        description: call.message
          ? `${call.createdBy.name}: «${call.message}»`
          : call.createdBy.name,
        duration: 20_000,
        action: {
          label: 'Voy',
          onClick: () => {
            actions.acknowledge.mutate(call.id);
          },
        },
      });
    },
    onSettled: (call) => {
      toast.dismiss(staffCallToastId(call));
    },
    onAnswered: (call) => {
      toast.success(staffCallStatusText(call), {
        description: staffCallPlace(call) ?? STAFF_CALL_REASON_LABEL[call.reason],
      });
    },
  });

  if (!answersCashier && !callsWaiters) return null;
  const badge = incoming.length > 0 ? incoming.length : outgoing.length;

  const answerButtons = (call: StaffCallDto) => (
    <>
      {call.status === StaffCallStatus.PENDING ? (
        <Button
          size="sm"
          disabled={actions.acknowledge.isPending}
          onClick={() => {
            actions.acknowledge.mutate(call.id);
          }}
        >
          Voy
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={actions.resolve.isPending}
        onClick={() => {
          actions.resolve.mutate(call.id);
        }}
      >
        Atendido
      </Button>
    </>
  );

  return (
    <>
      <Button
        variant={pending > 0 ? 'destructive' : 'ghost'}
        size="sm"
        className="relative"
        aria-label={`Llamados${badge > 0 ? ` (${String(badge)})` : ''}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {pending > 0 ? <BellRingIcon className="animate-pulse" /> : <BellIcon />}
        <span className="hidden lg:inline">Llamados</span>
        {badge > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] font-bold text-background tabular-nums">
            {badge}
          </span>
        ) : null}
      </Button>

      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent
            variant="side"
            title="Llamados"
            description="Se cierran solos al cobrar la cuenta o al cerrar la caja."
            footer={
              callsWaiters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCalling(true);
                  }}
                >
                  <BellRingIcon /> Llamar a un mesero
                </Button>
              ) : null
            }
          >
            {answersCashier ? (
              <section className="flex flex-col gap-2" aria-label="Para caja">
                <h3 className="text-sm font-semibold text-muted-foreground">Para caja</h3>
                {incoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nadie está llamando a caja.</p>
                ) : (
                  incoming.map((call) => (
                    <StaffCallCard
                      key={call.id}
                      call={call}
                      now={now}
                      highlight={call.status === StaffCallStatus.PENDING}
                      actions={answerButtons(call)}
                    />
                  ))
                )}
              </section>
            ) : null}
            <section className="flex flex-col gap-2" aria-label="Tus llamados">
              <h3 className="text-sm font-semibold text-muted-foreground">Tus llamados</h3>
              {outgoing.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tienes llamados abiertos.</p>
              ) : (
                outgoing.map((call) => (
                  <StaffCallCard
                    key={call.id}
                    call={call}
                    now={now}
                    showRecipient
                    actions={
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            actions.resolve.mutate(call.id);
                          }}
                        >
                          Ya lo atendieron
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            actions.cancel.mutate(call.id);
                          }}
                        >
                          Cancelar
                        </Button>
                      </>
                    }
                  />
                ))
              )}
            </section>
          </DialogContent>
        </Dialog>
      ) : null}

      {calling ? (
        <CallWaiterDialog
          place={null}
          description="Suena en el celular del mesero elegido (o de todos)."
          defaultWaiterId={null}
          reasons={[StaffCallReason.COME_OVER]}
          onClose={() => {
            setCalling(false);
          }}
        />
      ) : null}
    </>
  );
}
