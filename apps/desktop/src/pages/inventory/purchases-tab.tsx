import {
  queryKeys,
  useApi,
  useApiMutation,
  useHasPermission,
  useMoney,
  useSettings,
} from '@karbon/client';
import { type PurchaseDto, PurchaseStatus, Permission } from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  Pagination,
  Select,
  Spinner,
  Switch,
  toast,
} from '@karbon/ui';
import { toMinorUnits } from '@karbon/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageCheckIcon, PlusIcon, ShoppingCartIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDate, localIsoDate, unitLabel } from '../../lib/format';
import { useSuppliers } from './use-suppliers';

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibida',
  CANCELLED: 'Anulada',
};
const PAGE_SIZE = 20;

export function PurchasesTab() {
  const api = useApi();
  const money = useMoney();
  const canWrite = useHasPermission(Permission.PURCHASES_WRITE);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const purchases = useQuery({
    queryKey: [...queryKeys.purchases, page],
    queryFn: () => api.inventory.purchases({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const invalidate = [
    queryKeys.purchases,
    queryKeys.ingredients,
    queryKeys.movements,
    queryKeys.inventoryAlerts,
  ];
  const receive = useApiMutation((id: string) => api.inventory.receivePurchase(id), invalidate, {
    onSuccess: () => toast.success('Compra recibida: inventario actualizado'),
    onError: notifyError,
  });
  const cancel = useApiMutation((id: string) => api.inventory.cancelPurchase(id), invalidate, {
    onSuccess: () => toast.success('Compra anulada'),
    onError: notifyError,
  });

  const columns: Column<PurchaseDto>[] = [
    { key: 'date', header: 'Fecha', cell: (purchase) => formatDate(purchase.purchasedAt) },
    {
      key: 'supplier',
      header: 'Proveedor',
      cell: (purchase) => <span className="font-medium">{purchase.supplierName}</span>,
    },
    {
      key: 'invoice',
      header: 'Factura',
      cell: (purchase) => purchase.supplierInvoiceNumber ?? '—',
    },
    { key: 'items', header: 'Ítems', align: 'right', cell: (purchase) => purchase.items.length },
    {
      key: 'status',
      header: 'Estado',
      cell: (purchase) => (
        <Badge
          variant={
            purchase.status === 'RECEIVED'
              ? 'default'
              : purchase.status === 'CANCELLED'
                ? 'destructive'
                : 'secondary'
          }
        >
          {STATUS_LABEL[purchase.status]}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (purchase) => <span className="tabular-nums">{money(purchase.total)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (purchase) =>
        canWrite && purchase.status === PurchaseStatus.DRAFT ? (
          <span className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={receive.isPending}
              onClick={() => {
                receive.mutate(purchase.id);
              }}
            >
              <PackageCheckIcon /> Recibir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Anular"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(purchase.id);
              }}
            >
              <XIcon />
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <Button
          className="self-end"
          onClick={() => {
            setCreating(true);
          }}
        >
          <PlusIcon /> Nueva compra
        </Button>
      ) : null}
      {purchases.isPending ? <Spinner /> : null}
      {purchases.data ? (
        <DataTable
          columns={columns}
          rows={purchases.data.items}
          rowKey={(purchase) => purchase.id}
          empty={
            <EmptyState
              icon={ShoppingCartIcon}
              title="Sin compras"
              description="Registra las facturas de tus proveedores para alimentar el inventario."
            />
          }
        />
      ) : null}
      <Pagination
        page={page}
        total={purchases.data?.total ?? 0}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />
      {creating ? (
        <PurchaseDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

interface Line {
  key: number;
  ingredientId: string;
  quantity: string;
  unitCost: string;
}

function PurchaseDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const money = useMoney();
  const suppliers = useSuppliers();
  const currency = useSettings().data?.currency ?? 'COP';
  const ingredients = useQuery({
    queryKey: [...queryKeys.ingredients, 'purchase'],
    queryFn: () => api.inventory.ingredients(),
  });
  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(() => localIsoDate());
  const [receiveNow, setReceiveNow] = useState(true);
  const [lines, setLines] = useState<Line[]>([
    { key: 1, ingredientId: '', quantity: '', unitCost: '' },
  ]);
  const byId = new Map((ingredients.data ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const valid = lines.filter(
    (line) => line.ingredientId && Number(line.quantity) > 0 && Number(line.unitCost) >= 0,
  );
  const total = valid.reduce(
    (sum, line) => sum + toMinorUnits(Number(line.quantity) * Number(line.unitCost), currency),
    0,
  );

  const update = (key: number, patch: Partial<Line>): void => {
    setLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };
  const save = useApiMutation(
    () =>
      api.inventory.createPurchase({
        supplierId,
        supplierInvoiceNumber: invoice.trim() || null,
        purchasedAt: new Date(`${date}T12:00:00`).toISOString(),
        receive: receiveNow,
        items: valid.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      }),
    [queryKeys.purchases, queryKeys.ingredients, queryKeys.movements, queryKeys.inventoryAlerts],
    {
      onSuccess: () => {
        toast.success(
          receiveNow
            ? 'Compra registrada e inventario actualizado'
            : 'Compra guardada como borrador',
        );
        onClose();
      },
      onError: notifyError,
    },
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,56rem)]"
        title="Nueva compra"
        footer={
          <>
            <span className="mr-auto self-center font-semibold">Total: {money(total)}</span>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!supplierId || valid.length === 0 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar compra
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Proveedor">
            {(id) => (
              <Select
                id={id}
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                }}
              >
                <option value="">Selecciona…</option>
                {(suppliers.data ?? [])
                  .filter((supplier) => supplier.isActive)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="N.º factura del proveedor">
            {(id) => (
              <Input
                id={id}
                value={invoice}
                onChange={(event) => {
                  setInvoice(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Fecha">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                }}
              />
            )}
          </Field>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Insumo</th>
              <th className="py-1 font-medium">Cantidad</th>
              <th className="py-1 font-medium">Costo unitario</th>
              <th className="py-1 text-right font-medium">Subtotal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const unit = byId.get(line.ingredientId)?.unit;
              return (
                <tr key={line.key}>
                  <td className="py-1 pr-2">
                    <Select
                      aria-label="Insumo"
                      value={line.ingredientId}
                      onChange={(event) => {
                        update(line.key, { ingredientId: event.target.value });
                      }}
                    >
                      <option value="">Selecciona…</option>
                      {(ingredients.data ?? []).map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-1">
                      <Input
                        aria-label="Cantidad"
                        type="number"
                        min={0}
                        step="any"
                        value={line.quantity}
                        onChange={(event) => {
                          update(line.key, { quantity: event.target.value });
                        }}
                      />
                      <span className="w-8 text-muted-foreground">
                        {unit ? unitLabel(unit) : ''}
                      </span>
                    </div>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      aria-label="Costo unitario"
                      type="number"
                      min={0}
                      step="any"
                      value={line.unitCost}
                      onChange={(event) => {
                        update(line.key, { unitCost: event.target.value });
                      }}
                    />
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {money(
                      toMinorUnits(
                        (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
                        currency,
                      ),
                    )}
                  </td>
                  <td className="py-1 pl-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Quitar línea"
                      disabled={lines.length === 1}
                      onClick={() => {
                        setLines(lines.filter((candidate) => candidate.key !== line.key));
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setLines([
              ...lines,
              {
                key: Math.max(...lines.map((line) => line.key)) + 1,
                ingredientId: '',
                quantity: '',
                unitCost: '',
              },
            ]);
          }}
        >
          <PlusIcon /> Agregar línea
        </Button>
        <Switch
          checked={receiveNow}
          onCheckedChange={setReceiveNow}
          label="Recibir ahora (suma al inventario y actualiza costos)"
        />
      </DialogContent>
    </Dialog>
  );
}
