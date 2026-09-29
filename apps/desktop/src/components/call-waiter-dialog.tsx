import { useStaffCallActions } from '@karbon/client';
import { StaffCallTarget } from '@karbon/types';
import { notifyError, StaffCallDialog, toast } from '@karbon/ui';
import { STAFF_CALL_REASONS } from '@karbon/utils';

/**
 * Llamar al mesero de un pedido o de una mesa desde caja. El servidor deduce a quién le suena
 * (el mesero de la cuenta) y, si ya había un llamado abierto igual, insiste en él.
 */
export function CallWaiterDialog({
  place,
  description,
  onClose,
}: {
  place: { orderId: string } | { tableId: string };
  description: string;
  onClose: () => void;
}) {
  const actions = useStaffCallActions({ onError: notifyError });
  return (
    <StaffCallDialog
      title="Llamar al mesero"
      description={description}
      reasons={STAFF_CALL_REASONS.WAITER}
      busy={actions.create.isPending}
      onClose={onClose}
      onSubmit={(reason, message) => {
        actions.create.mutate(
          { target: StaffCallTarget.WAITER, reason, message, ...place },
          {
            onSuccess: (call) => {
              toast.success(
                call.callCount > 1
                  ? `Se insistió (${String(call.callCount)} avisos)`
                  : `Llamado enviado${call.targetUser ? ` a ${call.targetUser.name}` : ' a los meseros'}`,
              );
              onClose();
            },
          },
        );
      }}
    />
  );
}
