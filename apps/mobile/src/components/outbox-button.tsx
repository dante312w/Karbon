import { type OutboxEntry, useOutbox } from '@karbon/client';
import { Button, cn, Dialog, DialogContent, toast } from '@karbon/ui';
import { CloudOffIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

function describe(entry: OutboxEntry): string {
  const items = entry.operation.body.items ?? [];
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  return entry.operation.kind === 'createOrder'
    ? `Pedido nuevo · ${units} productos`
    : `Agregar ${units} productos a un pedido`;
}

/**
 * Pedidos guardados sin conexión. Se reenvían solos al volver la red; si el servidor rechaza
 * alguno (p. ej. la mesa ya se ocupó), el mesero decide qué hacer.
 */
export function OutboxButton() {
  const { entries, pending, failed, flush, discard } = useOutbox();
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn('gap-1.5', failed.length > 0 && 'border-destructive text-destructive')}
        onClick={() => {
          setOpen(true);
        }}
        aria-label={`${entries.length} pedidos sin enviar`}
      >
        <CloudOffIcon /> {entries.length}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          variant="side"
          title="Pendientes de enviar"
          description={
            pending.length > 0
              ? 'Se envían automáticamente cuando vuelve la conexión.'
              : 'Revisa los rechazados por el servidor.'
          }
          footer={
            <Button
              onClick={() => {
                void flush().then(() => toast.success('Reintento terminado'));
              }}
            >
              <RefreshCwIcon /> Reintentar ahora
            </Button>
          }
        >
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  'flex items-start justify-between gap-2 rounded-xl border p-3',
                  entry.failed && 'border-destructive',
                )}
              >
                <div className="text-sm">
                  <p className="font-medium">{describe(entry)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {entry.failed ? ' · rechazado' : ' · en espera'}
                  </p>
                  {entry.lastError ? (
                    <p className="text-xs text-destructive">{entry.lastError}</p>
                  ) : null}
                </div>
                {entry.failed ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Descartar"
                    onClick={() => {
                      void discard(entry.id);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
