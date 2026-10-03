import { ErrorCode, type TableDto } from '@karbon/types';
import { useState } from 'react';
import { ApiError } from '../http-client';
import { queryKeys } from '../query-keys';
import { useApi } from './context';
import { useApiMutation } from './queries';

/**
 * Unir mesas a `mainId` con la confirmación que pide el servidor cuando varias tienen consumo
 * (sus cuentas quedan separadas). Caja y celular muestran la pregunta con `pendingConfirmation`
 * y responden con `confirm` o `dismiss`.
 */
export function useMergeTables(
  mainId: string,
  {
    onSuccess,
    onError,
  }: { onSuccess?: (table: TableDto) => void; onError?: (error: Error) => void } = {},
) {
  const api = useApi();
  const [pending, setPending] = useState<{ tableIds: string[]; message: string } | null>(null);
  const mutation = useApiMutation(
    ({ tableIds, separateAccounts }: { tableIds: string[]; separateAccounts: boolean }) =>
      api.floor.merge(mainId, { tableIds, separateAccounts }),
    [queryKeys.tables, queryKeys.activeOrders],
    {
      onSuccess: (table) => {
        setPending(null);
        onSuccess?.(table);
      },
      onError: (error, { tableIds }) => {
        if (ApiError.is(error, ErrorCode.TABLE_MERGE_NEEDS_CONFIRMATION)) {
          setPending({ tableIds, message: error.message });
          return;
        }
        setPending(null);
        onError?.(error);
      },
    },
  );
  return {
    merge: (tableIds: string[]) => {
      mutation.mutate({ tableIds, separateAccounts: false });
    },
    /** Mensaje del servidor ("Varias mesas ya tienen consumo…") mientras espera la respuesta. */
    pendingConfirmation: pending?.message ?? null,
    confirm: () => {
      if (pending) mutation.mutate({ tableIds: pending.tableIds, separateAccounts: true });
    },
    dismiss: () => {
      setPending(null);
    },
    isPending: mutation.isPending,
  };
}
