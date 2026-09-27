import { useCategories, useMoney, useProducts } from '@karbon/client';
import type { ProductDto } from '@karbon/types';
import { Chip, cn, EmptyState, Input, Spinner } from '@karbon/ui';
import { SearchIcon, SearchXIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useAssetUrl } from '../../lib/runtime-context';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Catálogo del POS: categorías, búsqueda sin tildes y botones grandes. Clic = agregar 1;
 * clic derecho = agregar con cantidad y nota.
 */
export function ProductCatalog({
  disabled,
  onAdd,
  onAddWithNote,
}: {
  disabled: boolean;
  onAdd: (product: ProductDto) => void;
  onAddWithNote: (product: ProductDto) => void;
}) {
  const categories = useCategories();
  const products = useProducts();
  const money = useMoney();
  const assetUrl = useAssetUrl();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const activeCategories = (categories.data ?? []).filter((category) => category.isActive);
  const colorOf = new Map(activeCategories.map((category) => [category.id, category.color]));
  const term = normalize(deferredSearch.trim());
  const visible = (products.data ?? []).filter(
    (product) =>
      product.isActive &&
      (term
        ? normalize(product.name).includes(term) ||
          product.sku === deferredSearch.trim() ||
          product.barcode === deferredSearch.trim()
        : categoryId === null || product.categoryId === categoryId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">Buscar producto</span>
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar por nombre o código…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              // Lector de código de barras: Enter agrega la coincidencia exacta.
              const [only] = visible;
              if (event.key === 'Enter' && visible.length === 1 && only?.isAvailable) {
                onAdd(only);
                setSearch('');
              }
            }}
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías">
          <Chip
            role="tab"
            aria-selected={categoryId === null}
            active={categoryId === null}
            onClick={() => {
              setCategoryId(null);
            }}
          >
            Todo
          </Chip>
          {activeCategories.map((category) => (
            <Chip
              key={category.id}
              role="tab"
              aria-selected={categoryId === category.id}
              active={categoryId === category.id}
              onClick={() => {
                setCategoryId(category.id);
                setSearch('');
              }}
            >
              {category.color ? (
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
              ) : null}
              {category.name}
            </Chip>
          ))}
        </div>
      </div>

      {products.isPending ? <Spinner /> : null}
      {!products.isPending && visible.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          title="Sin resultados"
          description="Prueba con otro nombre o categoría."
        />
      ) : null}

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 overflow-y-auto pr-1 pb-2">
        {visible.map((product) => {
          const image = assetUrl(product.imageUrl);
          const soldOut = !product.isAvailable;
          return (
            <button
              key={product.id}
              type="button"
              disabled={disabled || soldOut}
              onClick={() => {
                onAdd(product);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!disabled && !soldOut) onAddWithNote(product);
              }}
              className={cn(
                'relative flex min-h-24 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-soft transition hover:shadow-elevated active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
              )}
              style={{
                borderTopColor: colorOf.get(product.categoryId) ?? undefined,
                borderTopWidth: 4,
              }}
            >
              {image ? (
                <img src={image} alt="" className="h-20 w-full object-cover" loading="lazy" />
              ) : null}
              <span className="flex flex-1 flex-col justify-between gap-1 p-2.5">
                <span className="line-clamp-2 text-sm leading-tight font-semibold">
                  {product.name}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {money(product.price)}
                </span>
              </span>
              {soldOut ? (
                <span className="absolute top-2 right-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground uppercase">
                  Agotado
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
