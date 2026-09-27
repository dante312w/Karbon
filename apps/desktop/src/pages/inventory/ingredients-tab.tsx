import { queryKeys, useApi, useApiMutation, useHasPermission, useSettings } from '@karbon/client';
import {
  type IngredientDto,
  type InventoryMovementType,
  MeasureUnit,
  Permission,
} from '@karbon/types';
import {
  Badge,
  Button,
  Chip,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  Select,
  Spinner,
  Switch,
  toast,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUpIcon,
  HistoryIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { formatMajor, formatQuantity, formatUnitCost, unitLabel } from '../../lib/format';
import { MovementsTable } from './movements-tab';

const UNIT_OPTIONS: Record<MeasureUnit, string> = {
  UNIT: 'Unidades',
  GRAM: 'Gramos',
  KILOGRAM: 'Kilogramos',
  MILLILITER: 'Mililitros',
  LITER: 'Litros',
};

type ManualMovement = Extract<InventoryMovementType, 'ENTRY' | 'EXIT' | 'WASTE' | 'ADJUSTMENT'>;

const MOVEMENT_OPTIONS: Record<ManualMovement, { label: string; hint: string }> = {
  ENTRY: { label: 'Entrada', hint: 'Mercancía que ingresa sin compra registrada' },
  EXIT: { label: 'Salida', hint: 'Consumo interno, traslado' },
  WASTE: { label: 'Merma', hint: 'Daño, vencimiento, desperdicio' },
  ADJUSTMENT: { label: 'Ajuste por conteo', hint: 'Escribe la cantidad física contada' },
};

export function IngredientsTab() {
  const api = useApi();
  const currency = useSettings().data?.currency ?? 'COP';
  const canWrite = useHasPermission(Permission.INVENTORY_WRITE);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState<
    | { kind: 'edit'; ingredient: IngredientDto | null }
    | { kind: 'movement' | 'kardex'; ingredient: IngredientDto }
    | null
  >(null);
  const term = useDeferredValue(search.trim());
  const ingredients = useQuery({
    queryKey: [...queryKeys.ingredients, term, lowOnly],
    queryFn: () =>
      api.inventory.ingredients({
        ...(term ? { search: term } : {}),
        ...(lowOnly ? { lowStockOnly: true } : {}),
      }),
  });

  const columns: Column<IngredientDto>[] = [
    {
      key: 'name',
      header: 'Insumo',
      cell: (ingredient) => (
        <span className="flex flex-col">
          <span className="font-medium">{ingredient.name}</span>
          {ingredient.sku ? (
            <span className="text-xs text-muted-foreground">{ingredient.sku}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Existencia',
      align: 'right',
      cell: (ingredient) => (
        <span className={ingredient.isLowStock ? 'font-semibold text-destructive' : ''}>
          {formatQuantity(ingredient.stock)} {unitLabel(ingredient.unit)}
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Mínimo',
      align: 'right',
      cell: (ingredient) => `${formatQuantity(ingredient.minStock)} ${unitLabel(ingredient.unit)}`,
    },
    {
      key: 'cost',
      header: 'Costo prom.',
      align: 'right',
      cell: (ingredient) => formatUnitCost(ingredient.averageCost, currency),
    },
    {
      key: 'value',
      header: 'Valor',
      align: 'right',
      cell: (ingredient) => formatMajor(ingredient.stock * ingredient.averageCost, currency),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (ingredient) =>
        !ingredient.isActive ? (
          <Badge variant="outline">Inactivo</Badge>
        ) : ingredient.isLowStock ? (
          <Badge variant="destructive">Bajo mínimo</Badge>
        ) : (
          <Badge variant="secondary">OK</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (ingredient) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Kardex"
            onClick={() => {
              setModal({ kind: 'kardex', ingredient });
            }}
          >
            <HistoryIcon />
          </Button>
          {canWrite ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Movimiento"
                onClick={() => {
                  setModal({ kind: 'movement', ingredient });
                }}
              >
                <ArrowDownUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Editar"
                onClick={() => {
                  setModal({ kind: 'edit', ingredient });
                }}
              >
                <PencilIcon />
              </Button>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">Buscar insumo</span>
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar insumo o código"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
        <Chip
          active={lowOnly}
          aria-pressed={lowOnly}
          onClick={() => {
            setLowOnly(!lowOnly);
          }}
        >
          Solo bajo mínimo
        </Chip>
        {canWrite ? (
          <Button
            onClick={() => {
              setModal({ kind: 'edit', ingredient: null });
            }}
          >
            <PlusIcon /> Nuevo insumo
          </Button>
        ) : null}
      </div>
      {ingredients.isPending ? <Spinner /> : null}
      {ingredients.data ? (
        <DataTable
          columns={columns}
          rows={ingredients.data}
          rowKey={(ingredient) => ingredient.id}
          rowClassName={(ingredient) => (ingredient.isActive ? undefined : 'opacity-60')}
          empty={
            <EmptyState
              icon={PackageIcon}
              title="Sin insumos"
              description="Crea los insumos que usan tus recetas."
            />
          }
        />
      ) : null}

      {modal?.kind === 'edit' ? (
        <IngredientDialog
          ingredient={modal.ingredient}
          onClose={() => {
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === 'movement' ? (
        <MovementDialog
          ingredient={modal.ingredient}
          onClose={() => {
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === 'kardex' ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <DialogContent
            className="w-[min(96vw,60rem)]"
            title={`Kardex · ${modal.ingredient.name}`}
            description={`Existencia actual: ${formatQuantity(modal.ingredient.stock)} ${unitLabel(modal.ingredient.unit)}`}
          >
            <MovementsTable ingredientId={modal.ingredient.id} unit={modal.ingredient.unit} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function IngredientDialog({
  ingredient,
  onClose,
}: {
  ingredient: IngredientDto | null;
  onClose: () => void;
}) {
  const api = useApi();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [sku, setSku] = useState(ingredient?.sku ?? '');
  const [unit, setUnit] = useState<MeasureUnit>(ingredient?.unit ?? MeasureUnit.UNIT);
  const [minStock, setMinStock] = useState(String(ingredient?.minStock ?? 0));
  const [cost, setCost] = useState('0');
  const [initialStock, setInitialStock] = useState('0');
  const [isActive, setIsActive] = useState(ingredient?.isActive ?? true);

  const save = useApiMutation(
    () => {
      const base = {
        name: name.trim(),
        sku: sku.trim() || null,
        unit,
        minStock: Number(minStock) || 0,
      };
      return ingredient
        ? api.inventory.updateIngredient(ingredient.id, { ...base, isActive })
        : api.inventory.createIngredient({
            ...base,
            cost: Number(cost) || 0,
            initialStock: Number(initialStock) || 0,
          });
    },
    [queryKeys.ingredients, queryKeys.inventoryAlerts],
    {
      onSuccess: () => {
        toast.success(ingredient ? 'Insumo actualizado' : 'Insumo creado');
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
        title={ingredient ? `Editar ${ingredient.name}` : 'Nuevo insumo'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={name.trim().length < 2 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" className="col-span-2">
            {(id) => (
              <Input
                id={id}
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Código (SKU)">
            {(id) => (
              <Input
                id={id}
                value={sku}
                onChange={(event) => {
                  setSku(event.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label="Unidad de medida"
            hint={ingredient ? 'No se cambia después de crear' : undefined}
          >
            {(id) => (
              <Select
                id={id}
                value={unit}
                disabled={ingredient !== null}
                onChange={(event) => {
                  setUnit(event.target.value as MeasureUnit);
                }}
              >
                {Object.entries(UNIT_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Stock mínimo (${unitLabel(unit)})`}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step="any"
                value={minStock}
                onChange={(event) => {
                  setMinStock(event.target.value);
                }}
              />
            )}
          </Field>
          {ingredient ? (
            <Switch
              className="self-end"
              checked={isActive}
              onCheckedChange={setIsActive}
              label="Activo"
            />
          ) : (
            <>
              <Field label={`Existencia inicial (${unitLabel(unit)})`}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="any"
                    value={initialStock}
                    onChange={(event) => {
                      setInitialStock(event.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label={`Costo por ${unitLabel(unit)}`} hint="En pesos, admite decimales">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="any"
                    value={cost}
                    onChange={(event) => {
                      setCost(event.target.value);
                    }}
                  />
                )}
              </Field>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({
  ingredient,
  onClose,
}: {
  ingredient: IngredientDto;
  onClose: () => void;
}) {
  const api = useApi();
  const [type, setType] = useState<ManualMovement>('ENTRY');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(String(ingredient.lastCost || ingredient.averageCost));
  const [reason, setReason] = useState('');
  const value = Number(quantity);
  const save = useApiMutation(
    () =>
      api.inventory.createMovement({
        ingredientId: ingredient.id,
        type,
        quantity: value,
        ...(type === 'ENTRY' ? { unitCost: Number(unitCost) || 0 } : {}),
        reason: reason.trim() || null,
      }),
    [queryKeys.ingredients, queryKeys.movements, queryKeys.inventoryAlerts],
    {
      onSuccess: (updated) => {
        toast.success(
          `${updated.name}: ${formatQuantity(updated.stock)} ${unitLabel(updated.unit)}`,
        );
        onClose();
      },
      onError: notifyError,
    },
  );
  const invalid = !Number.isFinite(value) || value < 0 || (type !== 'ADJUSTMENT' && value <= 0);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={`Movimiento · ${ingredient.name}`}
        description={`Existencia: ${formatQuantity(ingredient.stock)} ${unitLabel(ingredient.unit)}`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={invalid || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Registrar
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOVEMENT_OPTIONS) as ManualMovement[]).map((option) => (
            <Chip
              key={option}
              active={type === option}
              onClick={() => {
                setType(option);
              }}
            >
              {MOVEMENT_OPTIONS[option].label}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{MOVEMENT_OPTIONS[type].hint}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              type === 'ADJUSTMENT'
                ? `Conteo físico (${unitLabel(ingredient.unit)})`
                : `Cantidad (${unitLabel(ingredient.unit)})`
            }
          >
            {(id) => (
              <Input
                id={id}
                autoFocus
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
              />
            )}
          </Field>
          {type === 'ENTRY' ? (
            <Field label={`Costo por ${unitLabel(ingredient.unit)}`}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step="any"
                  value={unitCost}
                  onChange={(event) => {
                    setUnitCost(event.target.value);
                  }}
                />
              )}
            </Field>
          ) : null}
        </div>
        <Field label="Motivo">
          {(id) => (
            <Input
              id={id}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  );
}
