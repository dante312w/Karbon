import { queryKeys, useApi } from '@karbon/client';
import type { CustomerDto } from '@karbon/types';
import { Button, Input } from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { UserRoundIcon, XIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

/** Busca y elige un cliente (para facturar a su nombre o acumular su historial). */
export function CustomerPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (customer: CustomerDto | null) => void;
}) {
  const api = useApi();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const results = useQuery({
    queryKey: [...queryKeys.customers, 'search', term],
    queryFn: () => api.customers.list({ search: term, pageSize: 6 }),
    enabled: term.length >= 2,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <UserRoundIcon className="size-4" /> {value.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Quitar cliente"
          onClick={() => {
            onChange(null);
          }}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        placeholder="Buscar cliente por nombre, documento o teléfono"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      {term.length >= 2 && results.data ? (
        <ul className="overflow-hidden rounded-lg border bg-popover text-sm shadow-soft">
          {results.data.items.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Sin coincidencias</li>
          ) : null}
          {results.data.items.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="flex w-full justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  onChange(customer);
                  setSearch('');
                }}
              >
                <span>{customer.name}</span>
                <span className="text-muted-foreground">
                  {customer.documentNumber ?? customer.phone ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
