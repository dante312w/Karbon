import { newClientId, queryKeys, useApi, useApiMutation, useTerminology } from '@karbon/client';
import { OrderType, type TableDto } from '@karbon/types';
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  ORDER_TYPE_LABEL,
} from '@karbon/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

/**
 * Abre un pedido: en una mesa (pide comensales) o como cuenta sin mesa (barra, para llevar,
 * domicilio), identificada por un nombre. Se monta al abrirse (con `key`) para empezar limpio.
 */
export function NewOrderDialog({
  table,
  open,
  onOpenChange,
}: {
  table: TableDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const terms = useTerminology();
  const navigate = useNavigate();
  const [guests, setGuests] = useState<number | null>(table ? Math.min(2, table.capacity) : null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<OrderType>(OrderType.DINE_IN);

  const create = useApiMutation(
    () =>
      api.orders.create({
        id: newClientId(),
        type: table ? OrderType.DINE_IN : type,
        tableId: table?.id ?? null,
        guests,
        label: table ? null : label.trim() || null,
      }),
    [queryKeys.tables, queryKeys.activeOrders],
    {
      onSuccess: (order) => {
        onOpenChange(false);
        void navigate(`/pedidos/${order.id}`);
      },
      onError: notifyError,
    },
  );

  const title = table
    ? `Abrir ${table.name}`
    : terms.mode === 'BAR'
      ? 'Nueva cuenta'
      : 'Pedido sin mesa';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={
          table ? `Capacidad: ${table.capacity} personas` : 'Identifica la cuenta con un nombre'
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              size="lg"
              disabled={create.isPending || (!table && label.trim().length === 0)}
              onClick={() => {
                create.mutate(undefined);
              }}
            >
              {create.isPending ? 'Abriendo…' : 'Abrir pedido'}
            </Button>
          </>
        }
      >
        {table ? null : (
          <>
            <Field label="Nombre de la cuenta">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  placeholder={terms.mode === 'BAR' ? 'Ej. Carlos barra' : 'Ej. Pedido de Ana'}
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && label.trim()) create.mutate(undefined);
                  }}
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de pedido">
              {Object.values(OrderType).map((option) => (
                <Chip
                  key={option}
                  role="radio"
                  aria-checked={type === option}
                  active={type === option}
                  onClick={() => {
                    setType(option);
                  }}
                >
                  {ORDER_TYPE_LABEL[option]}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Personas</span>
          <div className="grid grid-cols-4 gap-2">
            {GUEST_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={guests === option ? 'default' : 'outline'}
                size="lg"
                onClick={() => {
                  setGuests(option);
                }}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
