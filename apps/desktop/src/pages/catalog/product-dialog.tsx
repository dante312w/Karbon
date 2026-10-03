import {
  queryKeys,
  useApi,
  useApiMutation,
  useCategories,
  useMoney,
  useSettings,
  useTaxes,
  useTerminology,
} from '@karbon/client';
import { KitchenStation, type ProductDto, type RecipeItemDto } from '@karbon/types';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@karbon/ui';
import { STATION_LABEL, toMinorUnits } from '@karbon/utils';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { MoneyInput } from '../../components/money-input';
import { formatUnitCost, unitLabel } from '../../lib/format';
import { imageFileToDataUrl } from '../../lib/images';
import { useAssetUrl } from '../../lib/runtime-context';
import { ProductNotesTab } from './note-options-dialog';

/** Alta y edición de productos: datos, receta (descuento de inventario) e imagen. */
export function ProductDialog({
  product,
  defaultCategoryId,
  onClose,
}: {
  product: ProductDto | null;
  defaultCategoryId: string | null;
  onClose: () => void;
}) {
  const api = useApi();
  const terms = useTerminology();
  const categories = useCategories();
  const taxes = useTaxes();
  const [current, setCurrent] = useState(product);
  const [form, setForm] = useState({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? defaultCategoryId ?? '',
    price: product?.price ?? 0,
    taxId: product?.taxId ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    description: product?.description ?? '',
    station:
      product?.station ?? (terms.mode === 'BAR' ? KitchenStation.BAR : KitchenStation.KITCHEN),
    sendToKitchen: product?.sendToKitchen ?? true,
    trackInventory: product?.trackInventory ?? true,
    isAvailable: product?.isAvailable ?? true,
    isActive: product?.isActive ?? true,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => {
    setForm({ ...form, [key]: value });
  };

  const save = useApiMutation(
    () => {
      const body = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        price: form.price,
        taxId: form.taxId || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        description: form.description.trim() || null,
        station: form.station,
        sendToKitchen: form.sendToKitchen,
        trackInventory: form.trackInventory,
        isAvailable: form.isAvailable,
      };
      return current
        ? api.catalog.updateProduct(current.id, { ...body, isActive: form.isActive })
        : api.catalog.createProduct(body);
    },
    [queryKeys.products],
    {
      onSuccess: (saved) => {
        toast.success(
          current
            ? 'Producto actualizado'
            : 'Producto creado: ahora puedes cargar su receta e imagen',
        );
        if (current) onClose();
        else setCurrent(saved);
      },
      onError: notifyError,
    },
  );

  const invalid = form.name.trim().length < 2 || !form.categoryId || form.price < 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,48rem)]"
        title={current ? current.name : 'Nuevo producto'}
      >
        <Tabs defaultValue="datos" className="flex flex-col gap-4">
          <TabsList className="self-start">
            <TabsTrigger value="datos">Datos</TabsTrigger>
            <TabsTrigger value="receta" disabled={!current}>
              Receta
            </TabsTrigger>
            <TabsTrigger value="imagen" disabled={!current}>
              Imagen
            </TabsTrigger>
            <TabsTrigger value="notas" disabled={!current}>
              Notas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="datos" className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" className="col-span-2">
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    value={form.name}
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label="Categoría">
                {(id) => (
                  <Select
                    id={id}
                    value={form.categoryId}
                    onChange={(event) => {
                      set('categoryId', event.target.value);
                    }}
                  >
                    <option value="">Selecciona…</option>
                    {(categories.data ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Precio de venta">
                {(id) => (
                  <MoneyInput
                    id={id}
                    value={form.price}
                    onValueChange={(value) => {
                      set('price', value);
                    }}
                  />
                )}
              </Field>
              <Field label="Impuesto" hint="Vacío = impuesto por defecto">
                {(id) => (
                  <Select
                    id={id}
                    value={form.taxId}
                    onChange={(event) => {
                      set('taxId', event.target.value);
                    }}
                  >
                    <option value="">Por defecto</option>
                    {(taxes.data ?? [])
                      .filter((tax) => tax.isActive)
                      .map((tax) => (
                        <option key={tax.id} value={tax.id}>
                          {tax.name} ({tax.rate} %)
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              {terms.mode === 'BAR' ? null : (
                <Field label="Se prepara en">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.station}
                      onChange={(event) => {
                        set('station', event.target.value as KitchenStation);
                      }}
                    >
                      {Object.values(KitchenStation).map((station) => (
                        <option key={station} value={station}>
                          {STATION_LABEL[station]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Código (SKU)">
                {(id) => (
                  <Input
                    id={id}
                    value={form.sku}
                    onChange={(event) => {
                      set('sku', event.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label="Código de barras">
                {(id) => (
                  <Input
                    id={id}
                    value={form.barcode}
                    onChange={(event) => {
                      set('barcode', event.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label="Descripción" className="col-span-2">
                {(id) => (
                  <Textarea
                    id={id}
                    value={form.description}
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Switch
                checked={form.sendToKitchen}
                onCheckedChange={(value) => {
                  set('sendToKitchen', value);
                }}
                label={`Se envía ${terms.toPrepArea} (si no, se sirve directo)`}
              />
              <Switch
                checked={form.trackInventory}
                onCheckedChange={(value) => {
                  set('trackInventory', value);
                }}
                label="Descuenta inventario por receta"
              />
              <Switch
                checked={form.isAvailable}
                onCheckedChange={(value) => {
                  set('isAvailable', value);
                }}
                label="Disponible (no agotado)"
              />
              {current ? (
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(value) => {
                    set('isActive', value);
                  }}
                  label="Activo en el catálogo"
                />
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                disabled={invalid || save.isPending}
                onClick={() => {
                  save.mutate(undefined);
                }}
              >
                {current ? 'Guardar cambios' : 'Crear producto'}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="receta">
            {current ? <RecipeEditor product={current} /> : null}
          </TabsContent>
          <TabsContent value="imagen">
            {current ? <ImageUploader product={current} onUploaded={setCurrent} /> : null}
          </TabsContent>
          <TabsContent value="notas">
            {current ? <ProductNotesTab product={current} /> : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface RecipeLine {
  key: number;
  ingredientId: string;
  quantity: string;
}

function RecipeEditor({ product }: { product: ProductDto }) {
  const api = useApi();
  const money = useMoney();
  const currency = useSettings().data?.currency ?? 'COP';
  const ingredients = useQuery({
    queryKey: [...queryKeys.ingredients, 'recipe'],
    queryFn: () => api.inventory.ingredients(),
  });
  const recipe = useQuery({
    queryKey: queryKeys.recipe(product.id),
    queryFn: () => api.catalog.recipe(product.id),
  });
  const [lines, setLines] = useState<RecipeLine[] | null>(null);
  const toLines = (items: RecipeItemDto[]): RecipeLine[] =>
    items.map((item, index) => ({
      key: index + 1,
      ingredientId: item.ingredientId,
      quantity: String(item.quantity),
    }));
  const editing = lines ?? (recipe.data ? toLines(recipe.data) : []);
  const byId = new Map((ingredients.data ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const cost = editing.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (byId.get(line.ingredientId)?.averageCost ?? 0),
    0,
  );
  const costMinor = toMinorUnits(cost, currency);
  const margin =
    product.price > 0 ? Math.round(((product.price - costMinor) / product.price) * 100) : 0;

  const save = useApiMutation(
    () =>
      api.catalog.setRecipe(product.id, {
        items: editing
          .filter((line) => line.ingredientId && Number(line.quantity) > 0)
          .map((line) => ({ ingredientId: line.ingredientId, quantity: Number(line.quantity) })),
      }),
    [queryKeys.recipe(product.id), queryKeys.products],
    {
      onSuccess: (saved) => {
        setLines(toLines(saved));
        toast.success('Receta guardada');
      },
      onError: notifyError,
    },
  );
  const update = (key: number, patch: Partial<RecipeLine>): void => {
    setLines(editing.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cantidad de cada insumo que consume una unidad vendida. Al cobrar el pedido se descuenta del
        inventario.
      </p>
      {editing.map((line) => {
        const ingredient = byId.get(line.ingredientId);
        return (
          <div key={line.key} className="grid grid-cols-[1fr_9rem_7rem_auto] items-center gap-2">
            <Select
              aria-label="Insumo"
              value={line.ingredientId}
              onChange={(event) => {
                update(line.key, { ingredientId: event.target.value });
              }}
            >
              <option value="">Selecciona insumo…</option>
              {(ingredients.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
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
              <span className="w-8 text-sm text-muted-foreground">
                {ingredient ? unitLabel(ingredient.unit) : ''}
              </span>
            </div>
            <span className="text-right text-sm text-muted-foreground tabular-nums">
              {ingredient
                ? formatUnitCost((Number(line.quantity) || 0) * ingredient.averageCost, currency)
                : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Quitar"
              onClick={() => {
                setLines(editing.filter((candidate) => candidate.key !== line.key));
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          setLines([
            ...editing,
            {
              key: Math.max(0, ...editing.map((line) => line.key)) + 1,
              ingredientId: '',
              quantity: '',
            },
          ]);
        }}
      >
        <PlusIcon /> Agregar insumo
      </Button>
      <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-sm">
        <span>
          Costo teórico <strong>{money(costMinor)}</strong> · Precio {money(product.price)} · Margen{' '}
          <strong className={margin < 30 ? 'text-destructive' : 'text-primary'}>{margin} %</strong>
        </span>
        <Button
          disabled={save.isPending}
          onClick={() => {
            save.mutate(undefined);
          }}
        >
          Guardar receta
        </Button>
      </div>
    </div>
  );
}

function ImageUploader({
  product,
  onUploaded,
}: {
  product: ProductDto;
  onUploaded: (product: ProductDto) => void;
}) {
  const api = useApi();
  const assetUrl = useAssetUrl();
  const upload = useApiMutation(
    (dataUrl: string) => api.catalog.uploadProductImage(product.id, dataUrl),
    [queryKeys.products],
    {
      onSuccess: (updated) => {
        onUploaded(updated);
        toast.success('Imagen actualizada');
      },
      onError: notifyError,
    },
  );
  const image = assetUrl(product.imageUrl);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid size-56 place-items-center overflow-hidden rounded-2xl border bg-muted">
        {image ? (
          <img src={image} alt={product.name} className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-10 text-muted-foreground" />
        )}
      </div>
      <Button asChild variant="outline" disabled={upload.isPending}>
        <label className="cursor-pointer">
          {upload.isPending ? 'Subiendo…' : 'Elegir imagen'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file)
                void imageFileToDataUrl(file).then((dataUrl) => {
                  upload.mutate(dataUrl);
                }, notifyError);
            }}
          />
        </label>
      </Button>
      <p className="text-xs text-muted-foreground">
        Se reduce automáticamente a 800 px para no pesar en los celulares.
      </p>
    </div>
  );
}
