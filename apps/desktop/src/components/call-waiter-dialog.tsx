import { useStaffCallActions, useStaffCallRecipients } from '@karbon/client';
import { type StaffCallReason, StaffCallTarget } from '@karbon/types';
import { notifyError, StaffCallDialog, toast } from '@karbon/ui';
import { STAFF_CALL_REASONS } from '@karbon/utils';

/**
 * Llamar a un mesero (o a todos) desde caja, por un pedido, una mesa o sin lugar. Va marcado el
 * mesero que atiende la mesa; si ya había un llamado abierto igual, el servidor insiste en él.
 */
export function CallWaiterDialog({
  place,
  description,
  defaultWaiterId,
  reasons = STAFF_CALL_REASONS.WAITER,
  onClose,
}: {
  place: { orderId: string } | { tableId: string } | null;
  description: string;
  /** Mesero de la mesa o del pedido; `null` = queda marcado "Todos". */
  defaultWaiterId: string | null;
  reasons?: readonly StaffCallReason[];
  onClose: () => void;
}) {
  const actions = useStaffCallActions({ onError: notifyError });
  const recipients = useStaffCallRecipients();
  return (
    <StaffCallDialog
      title="Llamar al mesero"
      description={description}
      reasons={reasons}
      recipients={{
        options: recipients.data ?? [],
        loading: recipients.isPending,
        defaultId: defaultWaiterId,
      }}
      busy={actions.create.isPending}
      onClose={onClose}
      onSubmit={(reason, message, waiterId) => {
        actions.create.mutate(
          { target: StaffCallTarget.WAITER, reason, message, waiterId, ...place },
          {
            onSuccess: (call) => {
              toast.success(
                call.callCount > 1
                  ? `Se insistió (${String(call.callCount)} avisos)`
                  : `Llamado enviado${call.targetUser ? ` a ${call.targetUser.name}` : ' a todos los meseros'}`,
              );
              onClose();
            },
          },
        );
      }}
    />
  );
}
