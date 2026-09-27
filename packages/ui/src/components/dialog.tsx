import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description?: ReactNode;
  /** `side` abre un panel lateral (carrito, detalle) en lugar de un modal centrado. */
  variant?: 'modal' | 'side';
  footer?: ReactNode;
}

export function DialogContent({
  title,
  description,
  variant = 'modal',
  footer,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] flex-col gap-4 bg-background p-5 shadow-elevated outline-none',
          variant === 'modal'
            ? 'top-1/2 left-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border'
            : 'inset-y-0 right-0 h-dvh w-[min(100vw,28rem)] max-h-dvh border-l',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Cerrar"
          >
            <XIcon className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
          {children}
        </div>
        {footer ? <div className="flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
