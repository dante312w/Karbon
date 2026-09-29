import { queryKeys, useApi, useApiMutation, useMoney, useTerminology } from '@karbon/client';
import type { CategoryDto, ProductDto } from '@karbon/types';
import {
  Badge,
  Button,
  cn,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  PageHeader,
  Spinner,
  Switch,
  toast,
} from '@karbon/ui';
import { STATION_LABEL } from '@karbon/utils';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { useAssetUrl } from '../../lib/runtime-context';
import { NoteOptionsDialog, NotesStrip } from './note-options-dialog';
import { ProductDialog } from './product-dialog';

const SWATCHES = [
  '#7C3AED',
  '#22C55E',
  '#0EA5E9',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#F43F5E',
  '#F97316',
  '#EAB308',
  '#14B8A6',
  '#71717A',
] as const;

export default function CatalogPage() {
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const assetUrl = useAssetUrl();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<{ product: ProductDto | null } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ category: CategoryDto | null } | null>(
    null,
  );
  const [editingNotes, setEditingNotes] = useState(false);
  const term = useDeferredValue(search.trim().toLowerCase());
  const categories = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => api.catalog.categories(true),
  });
  const products = useQuery({
    queryKey: [...queryKeys.products, 'all'],
    queryFn: () => api.catalog.products({ includeInactive: true }),
  });
  const selectedCategory = categories.data?.find((category) => category.id === categoryId) ?? null;
  const categoryName = new Map(
    (categories.data ?? []).map((category) => [category.id, category.name]),
  );
  const visible = (products.data ?? []).filter(
    (product) =>
      (categoryId === null || product.categoryId === categoryId) &&
      (!term || product.name.toLowerCase().includes(term) || product.sku === search.trim()),
  );

  const columns: Column<ProductDto>[] = [
    {
      key: 'image',
      header: '',
      cell: (product) => {
        const image = assetUrl(product.imageUrl);
        return image ? (
          <img src={image} alt="" className="size-10 rounded-lg object-cover" loading="lazy" />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg bg-muted">
            <ImageIcon className="size-4 text-muted-foreground" />
          </span>
        );
      },
    },
    {
      key: 'name',
      header: 'Producto',
      cell: (product) => (
        <span className="flex flex-col">
          <span className="font-medium">{product.name}</span>
          <span className="text-xs text-muted-foreground">
            {categoryName.get(product.categoryId) ?? ''}
          </span>
        </span>
      ),
    },
    { key: 'price', header: 'Precio', align: 'right', cell: (product) => money(product.price) },
    {
      key: 'cost',
      header: 'Costo',
      align: 'right',
      cell: (product) => (product.cost > 0 ? money(product.cost) : '—'),
    },
    {
      key: 'margin',
      header: 'Margen',
      align: 'right',
      cell: (product) => {
        if (product.cost <= 0 || product.price <= 0) return '—';
        const margin = Math.round(((product.price - product.cost) / product.price) * 100);
        return <span className={margin < 30 ? 'text-destructive' : ''}>{margin} %</span>;
      },
    },
    ...(terms.mode === 'BAR'
      ? []
      : [
          {
            key: 'station',
            header: 'Estación',
            cell: (product: ProductDto) =>
              product.sendToKitchen ? STATION_LABEL[product.station] : 'Directo',
          },
        ]),
    {
      key: 'status',
      header: 'Estado',
      cell: (product) =>
        !product.isActive ? (
          <Badge variant="outline">Inactivo</Badge>
        ) : !product.isAvailable ? (
          <Badge variant="destructive">Agotado</Badge>
        ) : (
          <Badge variant="secondary">Activo</Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Catálogo"
        description={`${products.data?.length ?? 0} productos · ${categories.data?.length ?? 0} categorías`}
        actions={
          <Button
            onClick={() => {
              setEditingProduct({ product: null });
            }}
          >
            <PlusIcon /> Nuevo producto
          </Button>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-1">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Categorías</h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Nueva categoría"
              onClick={() => {
                setEditingCategory({ category: null });
              }}
            >
              <PlusIcon />
            </Button>
          </div>
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-2 text-left text-sm',
              categoryId === null ? 'bg-foreground text-background' : 'hover:bg-accent',
            )}
            onClick={() => {
              setCategoryId(null);
            }}
          >
            Todas
          </button>
          {(categories.data ?? []).map((category) => (
            <div
              key={category.id}
              className={cn(
                'group flex items-center rounded-lg',
                categoryId === category.id ? 'bg-foreground text-background' : 'hover:bg-accent',
              )}
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                onClick={() => {
                  setCategoryId(category.id);
                }}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: category.color ?? 'transparent' }}
                />
                <span className={category.isActive ? '' : 'line-through opacity-60'}>
                  {category.name}
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${category.name}`}
                className="opacity-0 group-hover:opacity-100"
                onClick={() => {
                  setEditingCategory({ category });
                }}
              >
                <PencilIcon />
              </Button>
            </div>
          ))}
        </aside>
        <section className="flex min-w-0 flex-col gap-3">
          <NotesStrip
            category={selectedCategory}
            onEdit={() => {
              setEditingNotes(true);
            }}
          />
          <label className="relative">
            <span className="sr-only">Buscar producto</span>
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar producto o SKU"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          {products.isPending ? <Spinner /> : null}
          {products.data ? (
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(product) => product.id}
              onRowClick={(product) => {
                setEditingProduct({ product });
              }}
              rowClassName={(product) => (product.isActive ? undefined : 'opacity-60')}
              empty={
                <EmptyState
                  icon={BookOpenIcon}
                  title="Sin productos"
                  description="Crea tu primer producto."
                />
              }
            />
          ) : null}
        </section>
      </div>
      {editingProduct ? (
        <ProductDialog
          product={editingProduct.product}
          defaultCategoryId={categoryId}
          onClose={() => {
            setEditingProduct(null);
          }}
        />
      ) : null}
      {editingCategory ? (
        <CategoryDialog
          category={editingCategory.category}
          onClose={() => {
            setEditingCategory(null);
          }}
          onDeleted={(id) => {
            if (categoryId === id) setCategoryId(null);
          }}
        />
      ) : null}
      {editingNotes ? (
        <NoteOptionsDialog
          category={selectedCategory}
          onClose={() => {
            setEditingNotes(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
  onDeleted,
}: {
  category: CategoryDto | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const api = useApi();
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<string>(category?.color ?? SWATCHES[0]);
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), color, sortOrder: Number(sortOrder) || 0 };
      return category
        ? api.catalog.updateCategory(category.id, { ...body, isActive })
        : api.catalog.createCategory(body);
    },
    [queryKeys.categories],
    {
      onSuccess: () => {
        toast.success('Categoría guardada');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useApiMutation(
    (id: string) => api.catalog.removeCategory(id),
    [queryKeys.categories, queryKeys.noteOptions],
    {
      onSuccess: (_, id) => {
        toast.success('Categoría eliminada');
        onDeleted(id);
        onClose();
      },
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
        title={category ? `Editar ${category.name}` : 'Nueva categoría'}
        footer={
          <>
            {category ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => {
                  setRemoving(true);
                }}
              >
                <Trash2Icon /> Eliminar
              </Button>
            ) : null}
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
        <Field label="Nombre">
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
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Color en el POS</span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={color === swatch}
                className={cn(
                  'size-8 rounded-full border-2',
                  color === swatch ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: swatch }}
                onClick={() => {
                  setColor(swatch);
                }}
              />
            ))}
          </div>
        </div>
        <Field label="Orden" hint="Menor número = aparece primero">
          {(id) => (
            <Input
              id={id}
              type="number"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value);
              }}
            />
          )}
        </Field>
        {category ? (
          <>
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Activa" />
            <ConfirmDialog
              open={removing}
              onOpenChange={setRemoving}
              title={`Eliminar ${category.name}`}
              description="Solo se puede si ya no tiene productos ni subcategorías. Sus notas de un toque se eliminan con ella; los pedidos anteriores no cambian."
              confirmLabel="Eliminar"
              destructive
              onConfirm={() => remove.mutateAsync(category.id)}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
