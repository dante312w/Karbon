import { useStaffCallActions } from '@karbon/client';
import { StaffCallReason, StaffCallTarget } from '@karbon/types';
import { notifyError, StaffCallDialog, toast } from '@karbon/ui';
import { STAFF_CALL_NEEDS_PLACE, STAFF_CALL_REASONS } from '@karbon/utils';
import { vibrate } from '../lib/haptics';

/**
 * Llamar a caja. Desde un pedido se ofrece "Necesito cobrar" (se cierra solo al cobrarlo); sin
 * pedido, solo los motivos que no dependen de una mesa.
 */
export function CallCashierDialog({
  orderId,
  description,
  onClose,
}: {
  orderId?: string;
  description?: string;
  onClose: () => void;
}) {
  const actions = useStaffCallActions({ onError: notifyError });
  const reasons = orderId
    ? STAFF_CALL_REASONS.CASHIER
    : STAFF_CALL_REASONS.CASHIER.filter((reason) => !STAFF_CALL_NEEDS_PLACE.has(reason));
  return (
    <StaffCallDialog
      variant="side"
      title="Llamar a caja"
      {...(description ? { description } : {})}
      reasons={reasons}
      {...(orderId ? { defaultReason: StaffCallReason.CHARGE_TABLE } : {})}
      busy={actions.create.isPending}
      onClose={onClose}
      onSubmit={(reason, message) => {
        actions.create.mutate(
          { target: StaffCallTarget.CASHIER, reason, message, ...(orderId ? { orderId } : {}) },
          {
            onSuccess: (call) => {
              vibrate(80);
              toast.success(
                call.callCount > 1
                  ? `Se insistió a caja (${String(call.callCount)} avisos)`
                  : 'Caja recibió el llamado',
              );
              onClose();
            },
          },
        );
      }}
    />
  );
}
