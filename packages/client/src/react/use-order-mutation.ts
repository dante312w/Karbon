import { useMutation, type UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { ErrorCode, type OrderDto } from '@karbon/types';
import { ApiError } from '../http-client';
import { queryKeys } from '../query-keys';

/**
 * Mutación sobre un pedido con concurrencia optimista: toma la versión de la caché, guarda el
 * pedido devuelto y, si otra terminal lo modificó antes (409), recarga el pedido para que el
 * usuario vea el estado vigente antes de reintentar.
 */
export function useOrderMutation<TVariables = void>(
  orderId: string,
  run: (order: OrderDto, variables: TVariables) => Promise<OrderDto>,
  options: Omit<UseMutationOptions<OrderDto, Error, TVariables>, 'mutationFn'> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<OrderDto, Error, TVariables>({
    ...options,
    mutationFn: (variables) => {
      const current = queryClient.getQueryData<OrderDto>(queryKeys.order(orderId));
      if (!current) return Promise.reject(new Error('El pedido aún no se ha cargado'));
      return run(current, variables);
    },
    onSuccess: async (order, variables, result, context) => {
      queryClient.setQueryData(queryKeys.order(order.id), order);
      // Dividir o duplicar devuelve otro pedido: el original también cambió.
      if (order.id !== orderId)
        void queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      await options.onSuccess?.(order, variables, result, context);
    },
    onError: async (error, variables, result, context) => {
      if (ApiError.is(error, ErrorCode.ORDER_VERSION_CONFLICT)) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      }
      await options.onError?.(error, variables, result, context);
    },
  });
}
