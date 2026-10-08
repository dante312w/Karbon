import { PIN_MAX_LENGTH, type PinUserOption } from '@karbon/types';
import { ArrowLeftIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { NumberPad } from './number-pad';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Usuarios con PIN para elegir en el ingreso rápido (caja y celulares). */
export function PinUserGrid({
  users,
  onSelect,
}: {
  users: readonly PinUserOption[];
  onSelect: (user: PinUserOption) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft transition hover:border-primary hover:bg-accent active:scale-95"
          onClick={() => {
            onSelect(user);
          }}
        >
          <span className="grid size-12 place-items-center rounded-full bg-muted text-lg font-bold">
            {initials(user.name)}
          </span>
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs text-muted-foreground">{user.roleName}</span>
        </button>
      ))}
    </div>
  );
}

/** PIN del usuario elegido: progreso, error y teclado. */
export function PinEntry({
  user,
  pin,
  onPinChange,
  error,
  busy,
  onSubmit,
  onBack,
}: {
  user: PinUserOption;
  pin: string;
  onPinChange: (pin: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        className="flex items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-4" /> Cambiar usuario
      </button>
      <div className="text-center">
        <p className="text-lg font-semibold">{user.name}</p>
        <p className="text-sm text-muted-foreground">Digita tu PIN</p>
      </div>
      <div className="flex justify-center gap-3" aria-label={`${pin.length} dígitos ingresados`}>
        {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-3.5 rounded-full',
              index < pin.length ? 'bg-foreground' : 'bg-muted',
            )}
          />
        ))}
      </div>
      {error ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <NumberPad
        value={pin}
        onChange={onPinChange}
        maxLength={PIN_MAX_LENGTH}
        onSubmit={onSubmit}
        submitLabel={busy ? '…' : 'Entrar'}
      />
    </div>
  );
}
