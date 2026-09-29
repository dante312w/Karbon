import {
  staffCallToastId,
  useSession,
  useStaffCallActions,
  useStaffCallAlerts,
  useStaffCalls,
} from '@karbon/client';
import { type StaffCallDto, StaffCallStatus, StaffCallTarget } from '@karbon/types';
import { Button, notifyError, playChime, StaffCallCard, toast, useNow } from '@karbon/ui';
import {
  incomingStaffCalls,
  isStaffCallForMe,
  outgoingStaffCalls,
  STAFF_CALL_REASON_LABEL,
  staffCallPlace,
  staffCallStatusText,
  staffCallTitle,
} from '@karbon/utils';
import { useNavigate } from 'react-router';
import { vibrate } from '../lib/haptics';

/**
 * Llamados en el celular del mesero, arriba de cada pantalla: los que le hacen cocina o caja
 * (con sonido y vibración si son para él o para todos) y los que él hizo a caja.
 */
export function StaffCallsBar() {
  const session = useSession();
  const navigate = useNavigate();
  const calls = useStaffCalls().data ?? [];
  const now = useNow(30_000);
  const actions = useStaffCallActions({ onError: notifyError });

  useStaffCallAlerts(StaffCallTarget.WAITER, {
    onIncoming: (call) => {
      playChime('call');
      vibrate([300, 120, 300, 120, 300]);
      toast(staffCallTitle(call), {
        id: staffCallToastId(call),
        description: call.message ? `«${call.message}»` : call.createdBy.name,
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
      vibrate(120);
      toast.success(`Caja: ${staffCallStatusText(call).toLowerCase()}`, {
        description: staffCallPlace(call) ?? STAFF_CALL_REASON_LABEL[call.reason],
      });
    },
  });

  if (!session) return null;
  const incoming = incomingStaffCalls(calls, StaffCallTarget.WAITER, session.user);
  const mine = incoming.filter((call) => isStaffCallForMe(call, session.user.id));
  const others = incoming.filter((call) => !isStaffCallForMe(call, session.user.id));
  const outgoing = outgoingStaffCalls(calls, session.user.id);
  if (incoming.length === 0 && outgoing.length === 0) return null;

  const answer = (call: StaffCallDto) => (
    <>
      {call.status === StaffCallStatus.PENDING ? (
        <Button
          size="lg"
          className="flex-1"
          disabled={actions.acknowledge.isPending}
          onClick={() => {
            actions.acknowledge.mutate(call.id);
          }}
        >
          Voy
        </Button>
      ) : null}
      <Button
        size="lg"
        variant="outline"
        className="flex-1"
        disabled={actions.resolve.isPending}
        onClick={() => {
          actions.resolve.mutate(call.id);
        }}
      >
        Atendido
      </Button>
      {call.orderId ? (
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            void navigate(`/pedido/${call.orderId ?? ''}`);
          }}
        >
          Ver
        </Button>
      ) : null}
    </>
  );

  return (
    <section className="flex flex-col gap-2 border-b bg-background p-3" aria-label="Llamados">
      {mine.map((call) => (
        <StaffCallCard key={call.id} call={call} now={now} highlight actions={answer(call)} />
      ))}
      {others.length > 0 ? (
        <details className="rounded-xl border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            {others.length === 1
              ? '1 llamado para otro mesero'
              : `${String(others.length)} llamados para otros meseros`}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {others.map((call) => (
              <StaffCallCard
                key={call.id}
                call={call}
                now={now}
                showRecipient
                actions={answer(call)}
              />
            ))}
          </div>
        </details>
      ) : null}
      {outgoing.map((call) => (
        <StaffCallCard
          key={call.id}
          call={call}
          now={now}
          className="py-2"
          actions={
            <Button
              size="sm"
              variant="ghost"
              disabled={actions.cancel.isPending}
              onClick={() => {
                actions.cancel.mutate(call.id);
              }}
            >
              Ya no hace falta
            </Button>
          }
        />
      ))}
    </section>
  );
}
