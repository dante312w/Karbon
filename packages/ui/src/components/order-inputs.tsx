import { hasNote, ITEM_NOTES_MAX_LENGTH, toggleNote } from '@karbon/utils';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';
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

/**
 * Nota libre + notas de un toque de la categoría del producto ("Sin cebolla", "Sin hielo"…).
 * Cada toque agrega o quita la nota del texto, que sigue siendo editable a mano.
 */
export function NotesEditor({ value, onChange, suggestions, label = 'Notas' }: NotesEditorProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((note) => {
            const active = hasNote(value, note);
            return (
              <Chip
                key={note}
                active={active}
                aria-pressed={active}
                onClick={() => {
                  onChange(toggleNote(value, note));
                }}
              >
                {note}
              </Chip>
            );
          })}
        </div>
      ) : null}
      <Textarea
        id={id}
        maxLength={ITEM_NOTES_MAX_LENGTH}
        placeholder="Instrucciones especiales"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

export interface ItemNotesDialogProps {
  title: string;
  description: string;
  suggestions: readonly string[];
  /** Texto del botón según la cantidad elegida, p. ej. "Agregar · $25.000". */
  confirmLabel: (quantity: number) => string;
  onConfirm: (quantity: number, notes: string | null) => void;
  onClose: () => void;
}

/** Agregar un producto con cantidad y nota (caja y celulares). */
export function ItemNotesDialog({
  title,
  description,
  suggestions,
  confirmLabel,
  onConfirm,
  onClose,
}: ItemNotesDialogProps) {
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
        title={title}
        description={description}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="lg"
              onClick={() => {
                onConfirm(quantity, notes.trim() || null);
                onClose();
              }}
            >
              {confirmLabel(quantity)}
            </Button>
          </>
        }
      >
        <QuantityStepper value={quantity} onChange={setQuantity} className="self-center" />
        <NotesEditor value={notes} onChange={setNotes} suggestions={suggestions} />
      </DialogContent>
    </Dialog>
  );
}
