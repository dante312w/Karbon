import { Button, Dialog, DialogContent, Field, notifyError, Textarea } from '@karbon/ui';
import { useState } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Exige escribir un motivo (anulaciones, cancelaciones): queda en la auditoría. */
  requireReason?: boolean;
  /** Si falla, se muestra el error y el diálogo sigue abierto para reintentar. */
  onConfirm: (reason: string) => Promise<unknown>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = false,
  requireReason = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const invalid = requireReason && reason.trim().length < 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent
        title={title}
        {...(description ? { description } : {})}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Volver
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={invalid || busy}
              onClick={() => {
                setBusy(true);
                void onConfirm(reason.trim())
                  .then(() => {
                    setReason('');
                    onOpenChange(false);
                  })
                  .catch(notifyError)
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {busy ? 'Procesando…' : confirmLabel}
            </Button>
          </>
        }
      >
        {requireReason ? (
          <Field label="Motivo" hint="Queda registrado en la auditoría">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                autoFocus
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            )}
          </Field>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
