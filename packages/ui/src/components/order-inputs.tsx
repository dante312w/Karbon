import { MinusIcon, PlusIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Label, Textarea } from './form';
import { Chip } from './layout';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

/** Cantidad con botones grandes (táctil) para POS y celulares. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  className,
}: QuantityStepperProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Button
        variant="outline"
        size="icon"
        className="size-12 rounded-full"
        aria-label="Menos"
        disabled={value <= min}
        onClick={() => {
          onChange(Math.max(min, value - 1));
        }}
      >
        <MinusIcon />
      </Button>
      <output className="min-w-10 text-center text-2xl font-bold tabular-nums" aria-live="polite">
        {value}
      </output>
      <Button
        variant="outline"
        size="icon"
        className="size-12 rounded-full"
        aria-label="Más"
        disabled={value >= max}
        onClick={() => {
          onChange(Math.min(max, value + 1));
        }}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

export interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  label?: string;
}

/** Nota libre + sugerencias de un toque ("sin cebolla", "sin hielo"…). */
export function NotesEditor({ value, onChange, suggestions, label = 'Notas' }: NotesEditorProps) {
  const id = useId();
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const toggle = (note: string): void => {
    const next = parts.includes(note) ? parts.filter((part) => part !== note) : [...parts, note];
    onChange(next.join(', '));
  };
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((note) => (
          <Chip
            key={note}
            active={parts.includes(note)}
            aria-pressed={parts.includes(note)}
            onClick={() => {
              toggle(note);
            }}
          >
            {note}
          </Chip>
        ))}
      </div>
      <Textarea
        id={id}
        maxLength={200}
        placeholder="Instrucciones especiales"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
