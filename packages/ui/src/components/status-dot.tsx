import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Indicador circular de estado. Decorativo: el estado siempre se comunica también con texto. */
export function StatusDot({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      {...props}
    />
  );
}
