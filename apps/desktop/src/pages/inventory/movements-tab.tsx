import { queryKeys, useApi, useSettings } from '@karbon/client';
import { type InventoryMovementDto, InventoryMovementType, type MeasureUnit } from '@karbon/types';
import { type Column, DataTable, EmptyState, Pagination, Select, Spinner } from '@karbon/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, formatQuantity, formatUnitCost, unitLabel } from '../../lib/format';

const MOVEMENT_TYPE_LABEL: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra',
  ENTRY: 'Entrada',
  EXIT: 'Salida',
  WASTE: 'Merma',
  SALE: 'Venta',
  SALE_REVERSAL: 'Reverso de venta',
  ADJUSTMENT: 'Ajuste',
};

const PAGE_SIZE = 30;

/** Kardex: movimientos inmutables con saldo después de cada uno. */
export function MovementsTable({
  ingredientId,
  unit,
}: {
  ingredientId?: string;
  unit?: MeasureUnit;
}) {
  const api = useApi();
  const currency = useSettings().data?.currency ?? 'COP';
  const [page, setPage] = useState(1);
  const [type, setType] = useState<InventoryMovementType | ''>('');
  const ingredients = useQuery({
    queryKey: [...queryKeys.ingredients, 'all'],
    queryFn: () => api.inventory.ingredients({ includeInactive: true }),
    enabled: ingredientId === undefined,
  });
  const names = new Map((ingredients.data ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const query = {
    page,
    pageSize: PAGE_SIZE,
    ...(ingredientId ? { ingredientId } : {}),
    ...(type ? { type } : {}),
  };
  const movements = useQuery({
    queryKey: [...queryKeys.movements, query],
    queryFn: () => api.inventory.movements(query),
    placeholderData: keepPreviousData,
  });
  const unitOf = (movement: InventoryMovementDto): string =>
    unitLabel(unit ?? names.get(movement.ingredientId)?.unit ?? '');

  const columns: Column<InventoryMovementDto>[] = [
    { key: 'date', header: 'Fecha', cell: (movement) => formatDateTime(movement.createdAt) },
    ...(ingredientId
      ? []
      : [
          {
            key: 'ingredient',
            header: 'Insumo',
            cell: (movement: InventoryMovementDto) => names.get(movement.ingredientId)?.name ?? '—',
          },
        ]),
    { key: 'type', header: 'Tipo', cell: (movement) => MOVEMENT_TYPE_LABEL[movement.type] },
    {
      key: 'quantity',
      header: 'Cantidad',
      align: 'right',
      cell: (movement) => (
        <span className={movement.quantity < 0 ? 'text-destructive' : 'text-primary'}>
          {movement.quantity > 0 ? '+' : ''}
          {formatQuantity(movement.quantity)} {unitOf(movement)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      cell: (movement) => `${formatQuantity(movement.balanceAfter)} ${unitOf(movement)}`,
    },
    {
      key: 'cost',
      header: 'Costo unit.',
      align: 'right',
      cell: (movement) =>
        movement.unitCost === null ? '—' : formatUnitCost(movement.unitCost, currency),
    },
    { key: 'reason', header: 'Detalle', cell: (movement) => movement.reason ?? '' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Select
        className="w-56"
        aria-label="Tipo de movimiento"
        value={type}
        onChange={(event) => {
          setType(event.target.value as InventoryMovementType | '');
          setPage(1);
        }}
      >
        <option value="">Todos los tipos</option>
        {Object.values(InventoryMovementType).map((option) => (
          <option key={option} value={option}>
            {MOVEMENT_TYPE_LABEL[option]}
          </option>
        ))}
      </Select>
      {movements.isPending ? <Spinner /> : null}
      {movements.data ? (
        <DataTable
          columns={columns}
          rows={movements.data.items}
          rowKey={(movement) => movement.id}
          empty={<EmptyState icon={HistoryIcon} title="Sin movimientos" />}
        />
      ) : null}
      <Pagination
        page={page}
        total={movements.data?.total ?? 0}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />
    </div>
  );
}
