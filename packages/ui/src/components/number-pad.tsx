import { DeleteIcon } from 'lucide-react';
import { cn } from '../lib/cn';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const KEY_CLASS =
  'h-14 rounded-xl border bg-background text-xl font-semibold tabular-nums shadow-soft transition active:scale-95 hover:bg-accent disabled:opacity-40';

export interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  onSubmit: () => void;
  submitLabel?: string;
  className?: string;
}

/** Teclado numérico táctil del PIN: dígitos, borrar y confirmar. */
export function NumberPad({
  value,
  onChange,
  maxLength = 12,
  onSubmit,
  submitLabel = 'OK',
  className,
}: NumberPadProps) {
  const press = (key: string): void => {
    if ((value + key).length <= maxLength) onChange(value + key);
  };
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={KEY_CLASS}
          onClick={() => {
            press(key);
          }}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className={KEY_CLASS}
        aria-label="Borrar"
        onClick={() => {
          onChange(value.slice(0, -1));
        }}
      >
        <DeleteIcon className="mx-auto size-6" />
      </button>
      <button
        type="button"
        className={KEY_CLASS}
        onClick={() => {
          press('0');
        }}
      >
        0
      </button>
      <button
        type="button"
        className={cn(
          KEY_CLASS,
          'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
