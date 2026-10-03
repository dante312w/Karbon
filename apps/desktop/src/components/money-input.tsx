import { useSettings } from '@karbon/client';
import { Input } from '@karbon/ui';
import { type ComponentProps, useState } from 'react';
import { moneyToInput, parseMoney } from '../lib/format';

export interface MoneyInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  /** Unidades menores. */
  value: number;
  onValueChange: (value: number) => void;
}

/** Cero se muestra vacío para escribir directo sin borrar. */
function display(value: number, currency: string): string {
  return value === 0 ? '' : moneyToInput(value, currency);
}

/** Campo de dinero: se escribe en pesos y se entrega en unidades menores. */
export function MoneyInput({ value, onValueChange, ...props }: MoneyInputProps) {
  const currency = useSettings().data?.currency ?? 'COP';
  const [text, setText] = useState(() => display(value, currency));
  const [synced, setSynced] = useState({ value, currency });

  // El valor cambió desde afuera (sugerencia de monto, nuevo saldo): se refleja en el texto
  // sin pisar lo que el usuario está escribiendo cuando ya representa ese mismo valor.
  if (synced.value !== value || synced.currency !== currency) {
    setSynced({ value, currency });
    if (parseMoney(text, currency) !== value) setText(display(value, currency));
  }

  return (
    <Input
      inputMode="decimal"
      placeholder="0"
      value={text}
      onFocus={(event) => {
        event.target.select();
      }}
      onChange={(event) => {
        const next = parseMoney(event.target.value, currency) ?? 0;
        setText(event.target.value);
        setSynced({ value: next, currency });
        onValueChange(next);
      }}
      {...props}
    />
  );
}
