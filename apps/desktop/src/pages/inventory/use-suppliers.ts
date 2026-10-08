import { queryKeys, useApi } from '@karbon/client';
import { useQuery } from '@tanstack/react-query';

export function useSuppliers() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.suppliers, queryFn: () => api.inventory.suppliers() });
}
