import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateStaffCallRequest,
  Permission,
  SocketEvent,
  type StaffCallDto,
  type StaffCallEventData,
  StaffCallStatus,
  type StaffCallTarget,
} from '@karbon/types';
import { canAnswerStaffCall, isStaffCallForMe, mergeStaffCall } from '@karbon/utils';
import { queryKeys } from '../query-keys';
import { useApi } from './context';
import { useSocketEvent } from './realtime';
import { useSession } from './session';

/** Permisos con los que un usuario ve algún llamado (los hace o los atiende). */
const CALL_PERMISSIONS: readonly Permission[] = [
  Permission.CALLS_WAITER,
  Permission.CALLS_CASHIER,
  Permission.ORDERS_DELIVER,
  Permission.PAYMENTS_CREATE,
];

/** Llamados abiertos que hice o que puedo atender. El socket los mantiene al día. */
export function useStaffCalls() {
  const api = useApi();
  const session = useSession();
  const permissions = session?.user.permissions ?? [];
  return useQuery({
    queryKey: queryKeys.staffCalls,
    queryFn: api.staffCalls.list,
    enabled: CALL_PERMISSIONS.some((permission) => permissions.includes(permission)),
    // Respaldo por si se pierde un evento (celular suspendido): nunca más de un minuto atrasado.
    refetchInterval: 60_000,
  });
}

/**
 * Llamar, "Voy", atendido y cancelar. La respuesta del servidor actualiza la lista al instante;
 * si falla (otro ya lo tomó), se recarga para mostrar el estado real.
 */
export function useStaffCallActions({ onError }: { onError?: (error: Error) => void } = {}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const options = {
    onSuccess: (call: StaffCallDto) => {
      queryClient.setQueryData<StaffCallDto[]>(queryKeys.staffCalls, (current) =>
        mergeStaffCall(current, call),
      );
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffCalls });
      onError?.(error);
    },
  };
  return {
    create: useMutation({
      mutationFn: (body: CreateStaffCallRequest) => api.staffCalls.create(body),
      ...options,
    }),
    acknowledge: useMutation({ mutationFn: api.staffCalls.acknowledge, ...options }),
    resolve: useMutation({ mutationFn: api.staffCalls.resolve, ...options }),
    cancel: useMutation({ mutationFn: api.staffCalls.cancel, ...options }),
  };
}

export interface StaffCallAlertHandlers {
  /** Llega (o se insiste) un llamado que este equipo atiende, para mí o para todos. */
  onIncoming?: (call: StaffCallDto) => void;
  /** Alguien respondió a un llamado mío: "Va Laura" o "Atendido". */
  onAnswered?: (call: StaffCallDto) => void;
  /** El llamado dejó de estar pendiente (alguien va, se atendió o se canceló): se retira su aviso. */
  onSettled?: (call: StaffCallDto) => void;
}

/** Id del aviso en pantalla de un llamado, para retirarlo cuando alguien lo toma. */
export function staffCallToastId(call: Pick<StaffCallDto, 'id'>): string {
  return `staff-call-${call.id}`;
}

/**
 * Avisos de llamados para la terminal: `receive` es el destino que atiende este equipo (caja en
 * el escritorio, meseros en el celular). Sonido y texto los pone cada app.
 */
export function useStaffCallAlerts(receive: StaffCallTarget, handlers: StaffCallAlertHandlers) {
  const session = useSession();
  const onEvent = ({ call, alert }: StaffCallEventData): void => {
    if (!session) return;
    if (call.status !== StaffCallStatus.PENDING) handlers.onSettled?.(call);
    const me = session.user.id;
    if (call.createdBy.id === me) {
      const answeredBy =
        call.status === StaffCallStatus.ACKNOWLEDGED ? call.acknowledgedBy : call.closedBy;
      if (!alert && answeredBy && answeredBy.id !== me) handlers.onAnswered?.(call);
      return;
    }
    if (
      alert &&
      call.target === receive &&
      canAnswerStaffCall(receive, session.user.permissions) &&
      isStaffCallForMe(call, me)
    ) {
      handlers.onIncoming?.(call);
    }
  };
  useSocketEvent(SocketEvent.STAFF_CALL_CREATED, onEvent);
  useSocketEvent(SocketEvent.STAFF_CALL_UPDATED, onEvent);
}
