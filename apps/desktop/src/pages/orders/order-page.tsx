import {
  useApi,
  useHasPermission,
  useMoney,
  useOrder,
  useOrderAccess,
  useOrderMutation,
  useTerminology,
} from '@karbon/client';
import {
  type OrderDto,
  type OrderItemDto,
  OrderItemStatus,
  OrderStatus,
  Permission,
  type ProductDto,
} from '@karbon/types';
import {
  Badge,
  Button,
  EmptyState,
  ItemNotesDialog,
  notifyError,
  ORDER_STATUS_LABEL,
  Spinner,
  toast,
} from '@karbon/ui';
import { isOrderActive } from '@karbon/utils';
import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  BanIcon,
  CopyIcon,
  HandCoinsIcon,
  PencilIcon,
  PrinterIcon,
  ReceiptTextIcon,
  SendIcon,
  SplitIcon,
  WalletIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { formatTime } from '../../lib/format';
import { useReceiptPrinter } from '../../lib/printing';
import { ItemEditorDialog } from './item-dialogs';
import {
  DuplicateOrderDialog,
  MoveOrderDialog,
  OrderDetailsDialog,
  SplitOrderDialog,
} from './order-actions';
import { OrderTicket } from './order-ticket';
import { PaymentDialog } from './payment-dialog';
import { ProductCatalog } from './product-catalog';

type Modal =
  | { kind: 'add'; product: ProductDto }
  | { kind: 'item'; item: OrderItemDto }
  | { kind: 'move' | 'split' | 'duplicate' | 'details' | 'cancel' | 'pay' };

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const order = useOrder(orderId);

  if (order.isPending) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!order.data) {
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title="No se encontró el pedido"
        action={
          <Button asChild variant="outline">
            <Link to="/mesas">Volver a mesas</Link>
          </Button>
        }
      />
    );
  }
  return <OrderWorkspace key={order.data.id} order={order.data} />;
}

function OrderWorkspace({ order }: { order: OrderDto }) {
  const api = useApi();
  const money = useMoney();
  const terms = useTerminology();
  const navigate = useNavigate();
  const printer = useReceiptPrinter();
  const [modal, setModal] = useState<Modal | null>(null);
  const can = {
    update: useHasPermission(Permission.ORDERS_UPDATE),
    send: useHasPermission(Permission.ORDERS_SEND),
    bill: useHasPermission(Permission.ORDERS_REQUEST_BILL),
    cancel: useHasPermission(Permission.ORDERS_CANCEL),
    pay: useHasPermission(Permission.PAYMENTS_CREATE),
    move: useHasPermission(Permission.TABLES_OPERATE),
    create: useHasPermission(Permission.ORDERS_CREATE),
  };
  // Cada mesero opera sus pedidos; con `orders:manage_any` (caja, administración), todos.
  const owned = useOrderAccess().canManage(order.waiter.id);
  const editable = isOrderActive(order.status) && can.update && owned;
  const pendingCount = order.items
    .filter((item) => item.status === OrderItemStatus.PENDING)
    .reduce((sum, item) => sum + item.quantity, 0);
  const hasItems = order.items.some((item) => item.status !== OrderItemStatus.CANCELLED);
  const close = (): void => {
    setModal(null);
  };

  const add = useOrderMutation(
    order.id,
    // Agregar es conmutativo: sin versión, para no chocar con otra terminal que también agrega.
    (_current, line: { productId: string; quantity: number; notes: string | null }) =>
      api.orders.addItems(order.id, { items: [line] }),
    { onError: notifyError },
  );
  const send = useOrderMutation(order.id, (current) => api.orders.send(order.id, current.version), {
    onSuccess: () => toast.success(`Pedido enviado ${terms.toPrepArea}`),
    onError: notifyError,
  });
  const requestBill = useOrderMutation(
    order.id,
    (current) => api.orders.requestBill(order.id, current.version),
    {
      onSuccess: () => toast.success('Cuenta solicitada'),
      onError: notifyError,
    },
  );
  const cancel = useOrderMutation(
    order.id,
    (current, reason: string) => api.orders.cancel(order.id, { version: current.version, reason }),
    {
      onSuccess: () => {
        toast.success('Pedido cancelado');
        void navigate('/mesas');
      },
    },
  );
  const canSend = editable && can.send && pendingCount > 0;
  const canPay = editable && can.pay && hasItems;

  // Atajos del POS: F8 envía, F9 cobra.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F8' && canSend && !send.isPending) send.mutate();
      if (event.key === 'F9' && canPay) setModal({ kind: 'pay' });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [canSend, canPay, send]);

  const printPrebill = (): void => {
    void printer.print({ kind: 'order', orderId: order.id }).catch(notifyError);
  };

  const place = order.tableName ?? order.label ?? 'Sin mesa';

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col p-4">
        {editable ? (
          <ProductCatalog
            onAdd={(product) => {
              add.mutate({ productId: product.id, quantity: 1, notes: null });
            }}
            onAddWithNote={(product) => {
              setModal({ kind: 'add', product });
            }}
          />
        ) : (
          <EmptyState
            icon={ReceiptTextIcon}
            title={
              isOrderActive(order.status) && !owned
                ? `Pedido de ${order.waiter.name}`
                : `Pedido ${ORDER_STATUS_LABEL[order.status].toLowerCase()}`
            }
            description={
              isOrderActive(order.status) && !owned
                ? 'Solo quien lo atiende (o caja) puede modificarlo.'
                : order.cancelReason
                  ? `Motivo: ${order.cancelReason}`
                  : 'Este pedido ya no admite cambios.'
            }
            className="my-auto"
          />
        )}
      </section>

      <aside className="flex w-[26rem] shrink-0 flex-col border-l bg-background xl:w-[30rem]">
        <header className="flex flex-col gap-2 border-b p-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Volver a mesas"
              onClick={() => {
                void navigate('/mesas');
              }}
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{place}</h1>
              <p className="truncate text-xs text-muted-foreground">
                #{order.number} · {order.waiter.name} · {formatTime(order.createdAt)}
                {order.guests ? ` · ${order.guests} pers.` : ''}
                {order.customerName ? ` · ${order.customerName}` : ''}
              </p>
            </div>
            <Badge
              variant={order.status === OrderStatus.BILL_REQUESTED ? 'destructive' : 'secondary'}
            >
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </div>
          {order.notes ? (
            <p className="rounded-md bg-muted px-2 py-1 text-xs">{order.notes}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {editable ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setModal({ kind: 'details' });
                }}
              >
                <PencilIcon /> Detalles
              </Button>
            ) : null}
            {editable && can.move && order.tableId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setModal({ kind: 'move' });
                }}
              >
                <ArrowRightLeftIcon /> Mover
              </Button>
            ) : null}
            {editable && hasItems && order.paidAmount === 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setModal({ kind: 'split' });
                }}
              >
                <SplitIcon /> Dividir
              </Button>
            ) : null}
            {can.create && hasItems ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setModal({ kind: 'duplicate' });
                }}
              >
                <CopyIcon /> Duplicar
              </Button>
            ) : null}
            {hasItems ? (
              <Button variant="outline" size="sm" onClick={printPrebill}>
                <PrinterIcon /> Precuenta
              </Button>
            ) : null}
            {editable && can.cancel ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  setModal({ kind: 'cancel' });
                }}
              >
                <BanIcon /> Cancelar
              </Button>
            ) : null}
          </div>
        </header>

        <OrderTicket
          order={order}
          editable={editable}
          onSelectItem={(item) => {
            setModal({ kind: 'item', item });
          }}
        />

        {editable ? (
          <footer className="grid grid-cols-2 gap-2 border-t p-4">
            {canSend ? (
              <Button
                size="touch"
                className="col-span-2"
                disabled={send.isPending}
                onClick={() => {
                  send.mutate();
                }}
              >
                <SendIcon /> {terms.sendAction} ({pendingCount}) · F8
              </Button>
            ) : null}
            {can.bill && order.status === OrderStatus.OPEN ? (
              <Button
                variant="outline"
                size="lg"
                disabled={!hasItems || pendingCount > 0 || requestBill.isPending}
                onClick={() => {
                  requestBill.mutate();
                }}
              >
                <HandCoinsIcon /> Pedir cuenta
              </Button>
            ) : null}
            {can.pay ? (
              <Button
                size="lg"
                variant={pendingCount > 0 ? 'secondary' : 'default'}
                className={order.status === OrderStatus.OPEN && can.bill ? '' : 'col-span-2'}
                disabled={!canPay}
                onClick={() => {
                  setModal({ kind: 'pay' });
                }}
              >
                <WalletIcon /> Cobrar · F9
              </Button>
            ) : null}
          </footer>
        ) : null}
      </aside>

      {modal?.kind === 'add' ? (
        <ItemNotesDialog
          title={modal.product.name}
          description={money(modal.product.price)}
          suggestions={terms.quickNotes}
          confirmLabel={(quantity) => `Agregar · ${money(modal.product.price * quantity)}`}
          onClose={close}
          onConfirm={(quantity, notes) => {
            add.mutate({ productId: modal.product.id, quantity, notes });
          }}
        />
      ) : null}
      {modal?.kind === 'item' ? (
        <ItemEditorDialog
          orderId={order.id}
          item={order.items.find((item) => item.id === modal.item.id) ?? modal.item}
          items={[...order.items].sort((a, b) => a.sortOrder - b.sortOrder)}
          onClose={close}
        />
      ) : null}
      {modal?.kind === 'move' ? <MoveOrderDialog order={order} onClose={close} /> : null}
      {modal?.kind === 'split' ? <SplitOrderDialog order={order} onClose={close} /> : null}
      {modal?.kind === 'duplicate' ? <DuplicateOrderDialog order={order} onClose={close} /> : null}
      {modal?.kind === 'details' ? <OrderDetailsDialog order={order} onClose={close} /> : null}
      {modal?.kind === 'pay' ? (
        <PaymentDialog
          order={order}
          onClose={close}
          onFinished={() => {
            close();
            void navigate('/mesas');
          }}
        />
      ) : null}
      <ConfirmDialog
        open={modal?.kind === 'cancel'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={`Cancelar pedido #${order.number}`}
        description={`Se anulan todos los productos y se avisa ${terms.toPrepArea}. No aplica si ya tiene pagos.`}
        confirmLabel="Cancelar pedido"
        destructive
        requireReason
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
    </div>
  );
}
