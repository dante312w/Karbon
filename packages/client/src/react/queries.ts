import {
  type QueryKey,
  useMutation,
  type UseMutationOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BusinessMode,
  type DateRangeQuery,
  type KitchenStation,
  type RestaurantSettingsDto,
} from '@karbon/types';
import { formatMoney, getTerminology, type Terminology } from '@karbon/utils';
import { useCallback } from 'react';
import { queryKeys } from '../query-keys';
import { useApi } from './context';
import { useSession } from './session';

/** Consultas que requieren sesión solo se ejecutan con sesión activa. */
function useAuthed(): boolean {
  return useSession() !== null;
}

export function useSettings() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.settings.get,
    enabled: useAuthed(),
    staleTime: 5 * 60_000,
  });
}

const FALLBACK_MONEY = { currency: 'COP', locale: 'es-CO' };

/** Formateador de dinero con la moneda y el idioma del negocio. */
export function useMoney(): (amount: number) => string {
  const settings = useSettings().data;
  const currency = settings?.currency ?? FALLBACK_MONEY.currency;
  const locale = settings?.locale ?? FALLBACK_MONEY.locale;
  return useCallback(
    (amount: number) => formatMoney(amount, { currency, locale }),
    [currency, locale],
  );
}

/** Vocabulario del modo actual (restaurante: "Cocina"; bar: "Barra"). */
export function useTerminology(): Terminology & { mode: RestaurantSettingsDto['businessMode'] } {
  const mode = useSettings().data?.businessMode ?? BusinessMode.RESTAURANT;
  return { ...getTerminology(mode), mode };
}

export function useTables() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tables,
    queryFn: () => api.floor.tables(),
    enabled: useAuthed(),
  });
}

export function useAreas() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.areas, queryFn: api.floor.areas, enabled: useAuthed() });
}

export function useCategories() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.catalog.categories(),
    enabled: useAuthed(),
  });
}

export function useProducts() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.products,
    queryFn: () => api.catalog.products(),
    enabled: useAuthed(),
  });
}

export function useOrder(id: string | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.order(id ?? 'none'),
    queryFn: () => api.orders.get(id ?? ''),
    enabled: useAuthed() && Boolean(id),
  });
}

export function useActiveOrders() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.activeOrders,
    queryFn: () => api.orders.list({ status: 'ACTIVE', pageSize: 200 }),
    enabled: useAuthed(),
  });
}

export function useKitchenTickets(station?: KitchenStation) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.tickets, station ?? 'all'],
    queryFn: () => api.kitchen.tickets(station ? { station } : {}),
    enabled: useAuthed(),
    // Respaldo por si se pierde un evento: el tablero nunca queda desactualizado más de 30 s.
    refetchInterval: 30_000,
  });
}

export function usePrinters() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.printers,
    queryFn: api.settings.printers,
    enabled: useAuthed(),
    staleTime: 5 * 60_000,
  });
}

export function useTaxes() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.taxes,
    queryFn: api.settings.taxes,
    enabled: useAuthed(),
    staleTime: 5 * 60_000,
  });
}

export function useCashSession() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.cash, queryFn: api.cash.current, enabled: useAuthed() });
}

export function useDashboard(range: DateRangeQuery) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.reports, range.from ?? 'today', range.to ?? 'today'],
    queryFn: () => api.reports.dashboard(range),
    enabled: useAuthed(),
  });
}

/**
 * Mutación que al terminar invalida las claves indicadas. Evita repetir la misma plomería de
 * `onSuccess` en cada pantalla.
 */
export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidate: readonly QueryKey[] = [],
  options: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    ...options,
    mutationFn,
    onSuccess: async (data, variables, result, context) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      await options.onSuccess?.(data, variables, result, context);
    },
  });
}
