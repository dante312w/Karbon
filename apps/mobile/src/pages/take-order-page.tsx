import {
  newClientId,
  queryKeys,
  useApi,
  useCategories,
  useHasPermission,
  useMoney,
  useOrder,
  useOutbox,
  useProducts,
  useTables,
  useTerminology,
} from '@karbon/client';
import { OrderType, Permission, type ProductDto } from '@karbon/types';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  NotesEditor,
  notifyError,
  ORDER_TYPE_LABEL,
  QuantityStepper,
  toast,
} from '@karbon/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  MessageSquarePlusIcon,
  SearchIcon,
  SendIcon,
  ShoppingBasketIcon,
  Trash2Icon,
} from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useCart } from '../lib/cart';
import { vibrate } from '../lib/haptics';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Toma de pedido en el celular: se arma el carrito sin conexión y se envía de una vez.
 * Sirve para agregar a un pedido existente o para abrir uno nuevo (mesa o cuenta sin mesa).
 */
export default function TakeOrderPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const terms = useTerminology();
  const money = useMoney();
  const { outbox } = useOutbox();
  const canSend = useHasPermission(Permission.ORDERS_SEND);
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const tableId = params.get('mesa');
  const guests = Number(params.get('personas')) || null;
  const order = useOrder(orderId);
  const table = (useTables().data ?? []).find((candidate) => candidate.id === tableId);
  const categories = useCategories();
  const products = useProducts();
  const cart = useCart(`karbon.cart.${orderId ?? tableId ?? 'sin-mesa'}`);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const term = normalize(useDeferredValue(search.trim()));
  const [noting, setNoting] = useState<ProductDto | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<OrderType>(OrderType.DINE_IN);
  const [busy, setBusy] = useState(false);

  const isNew = !orderId;
  const needsLabel = isNew && !tableId;
  const title = orderId
    ? `${order.data?.tableName ?? order.data?.label ?? 'Pedido'} · #${String(order.data?.number ?? '')}`
    : (table?.name ?? (terms.mode === 'BAR' ? 'Nueva cuenta' : 'Pedido sin mesa'));

  const activeCategories = (categories.data ?? []).filter((category) => category.isActive);
  const visible = (products.data ?? []).filter(
    (product) =>
      product.isActive &&
      (term
        ? normalize(product.name).includes(term)
        : categoryId === null || product.categoryId === categoryId),
  );

  const back = (): void => {
    void navigate(orderId ? `/pedido/${orderId}` : '/');
  };

  const submit = async (send: boolean): Promise<void> => {
    if (cart.count === 0 || busy) return;
    if (needsLabel && !label.trim()) {
      toast.error('Escribe el nombre de la cuenta');
      return;
    }
    setBusy(true);
    try {
      const items = cart.toItems();
      const result = orderId
        ? await outbox.send(api, { kind: 'addItems', orderId, body: { items, send } })
        : await outbox.send(api, {
            kind: 'createOrder',
            body: {
              id: newClientId(),
              type: tableId ? OrderType.DINE_IN : type,
              tableId,
              guests,
              label: needsLabel ? label.trim() : null,
              items,
              send,
            },
          });
      cart.clear();
      if (result.queued || !result.order) {
        toast.warning('Sin conexión: el pedido quedó guardado y se enviará solo al volver la red.');
        void navigate('/', { replace: true });
        return;
      }
      queryClient.setQueryData(queryKeys.order(result.order.id), result.order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      toast.success(send ? `Enviado ${terms.toPrepArea}` : 'Pedido guardado');
      void navigate(`/pedido/${result.order.id}`, { replace: true });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col pb-24">
      <div className="sticky top-[3.25rem] z-20 flex flex-col gap-2 border-b bg-background p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Volver" onClick={back}>
            <ArrowLeftIcon />
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-semibold">{title}</h1>
        </div>
        <label className="relative">
          <span className="sr-only">Buscar producto</span>
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar producto"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3">
          <Chip
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

      <ul className="flex flex-col divide-y bg-background">
        {visible.map((product) => {
          const inCart = cart.lines
            .filter((line) => line.productId === product.id)
            .reduce((sum, line) => sum + line.quantity, 0);
          const soldOut = !product.isAvailable;
          return (
            <li
              key={product.id}
              className={cn('flex items-center gap-2 px-3 py-2', soldOut && 'opacity-50')}
            >
              <button
                type="button"
                disabled={soldOut}
                className="flex min-h-12 flex-1 flex-col items-start text-left active:opacity-60"
                onClick={() => {
                  cart.add(product);
                  vibrate(10);
                }}
              >
                <span className="font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {soldOut ? 'Agotado' : money(product.price)}
                </span>
              </button>
              {inCart > 0 ? (
                <span className="grid size-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {inCart}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Agregar ${product.name} con nota`}
                disabled={soldOut}
                onClick={() => {
                  setNoting(product);
                }}
              >
                <MessageSquarePlusIcon />
              </Button>
            </li>
          );
        })}
      </ul>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            size="touch"
            className="w-full justify-between"
            onClick={() => {
              setCartOpen(true);
            }}
          >
            <span className="flex items-center gap-2">
              <ShoppingBasketIcon /> Ver pedido ({cart.count})
            </span>
            <span className="tabular-nums">{money(cart.total)}</span>
          </Button>
        </div>
      ) : null}

      {noting ? (
        <NoteDialog
          product={noting}
          suggestions={terms.quickNotes}
          onClose={() => {
            setNoting(null);
          }}
          onAdd={(quantity, notes) => {
            cart.add(noting, quantity, notes);
          }}
        />
      ) : null}

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent
          variant="side"
          title="Pedido por enviar"
          description={title}
          footer={
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="lg"
                disabled={busy || cart.count === 0}
                onClick={() => {
                  void submit(false);
                }}
              >
                Guardar
              </Button>
              <Button
                size="lg"
                disabled={busy || cart.count === 0 || !canSend}
                onClick={() => {
                  void submit(true);
                }}
              >
                <SendIcon /> {terms.sendAction}
              </Button>
            </div>
          }
        >
          {needsLabel ? (
            <>
              <Field label="Nombre de la cuenta">
                {(id) => (
                  <Input
                    id={id}
                    value={label}
                    placeholder="Ej. Carlos"
                    onChange={(event) => {
                      setLabel(event.target.value);
                    }}
                  />
                )}
              </Field>
              {terms.mode === 'BAR' ? null : (
                <div className="flex flex-wrap gap-2">
                  {[OrderType.DINE_IN, OrderType.TAKEAWAY, OrderType.DELIVERY].map((option) => (
                    <Chip
                      key={option}
                      active={type === option}
                      onClick={() => {
                        setType(option);
                      }}
                    >
                      {ORDER_TYPE_LABEL[option]}
                    </Chip>
                  ))}
                </div>
              )}
            </>
          ) : null}
          <ul className="flex flex-col gap-3">
            {cart.lines.map((line) => (
              <li key={line.key} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{line.name}</span>
                  <span className="font-semibold tabular-nums">
                    {money(line.price * line.quantity)}
                  </span>
                </div>
                <Input
                  aria-label={`Nota para ${line.name}`}
                  placeholder="Nota (sin cebolla, sin hielo…)"
                  value={line.notes}
                  onChange={(event) => {
                    cart.update(line.key, { notes: event.target.value });
                  }}
                />
                <div className="flex items-center justify-between">
                  <QuantityStepper
                    value={line.quantity}
                    onChange={(quantity) => {
                      cart.update(line.key, { quantity });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${line.name}`}
                    onClick={() => {
                      cart.remove(line.key);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {isNew && guests ? (
            <p className="text-sm text-muted-foreground">{guests} personas</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteDialog({
  product,
  suggestions,
  onClose,
  onAdd,
}: {
  product: ProductDto;
  suggestions: readonly string[];
  onClose: () => void;
  onAdd: (quantity: number, notes: string) => void;
}) {
  const money = useMoney();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={product.name}
        description={money(product.price)}
        footer={
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              onAdd(quantity, notes);
              onClose();
            }}
          >
            Agregar · {money(product.price * quantity)}
          </Button>
        }
      >
        <QuantityStepper value={quantity} onChange={setQuantity} className="self-center" />
        <NotesEditor value={notes} onChange={setNotes} suggestions={suggestions} />
      </DialogContent>
    </Dialog>
  );
}
