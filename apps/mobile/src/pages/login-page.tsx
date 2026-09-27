import { ApiError, useApi, useAuthActions, useSession } from '@karbon/client';
import type { PinUserOption } from '@karbon/types';
import { ConnectionBadge, errorMessage, NumberPad, Spinner, useServerHealth } from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { usePwaMode } from '../lib/pwa-mode';

const DEVICE_NAME = 'Celular';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Ingreso rápido con PIN: el mesero toca su nombre y digita su clave numérica. */
export function LoginPage() {
  const api = useApi();
  const session = useSession();
  const pwaMode = usePwaMode();
  const connection = useServerHealth('');
  const { loginWithPin } = useAuthActions();
  const online = connection.status === 'online' || connection.status === 'degraded';
  const users = useQuery({ queryKey: ['pin-users'], queryFn: api.auth.pinUsers, enabled: online });
  const [selected, setSelected] = useState<PinUserOption | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = (): void => {
    if (!selected || pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    loginWithPin(selected.id, pin, DEVICE_NAME)
      .catch((caught: unknown) => {
        setError(
          ApiError.is(caught, 'INVALID_CREDENTIALS') ? 'PIN incorrecto' : errorMessage(caught),
        );
        setPin('');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-brand text-brand-foreground">
      <header className="flex flex-1 flex-col justify-between gap-6 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <ConnectionBadge
          connection={connection}
          className="self-end bg-background text-foreground"
        />
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
            K
          </div>
          <div>
            <p className="text-xl font-bold">Karbon Meseros</p>
            <p className="text-sm text-brand-foreground/70">Toma pedidos desde la mesa</p>
          </div>
        </div>
      </header>

      <main className="flex flex-col rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground">
        {selected ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className="flex items-center gap-1 self-start text-sm text-muted-foreground"
              onClick={() => {
                setSelected(null);
                setPin('');
                setError(null);
              }}
            >
              <ArrowLeftIcon className="size-4" /> Cambiar
            </button>
            <div className="text-center">
              <p className="text-xl font-semibold">{selected.name}</p>
              <p className="text-sm text-muted-foreground">Digita tu PIN</p>
            </div>
            <div
              className="flex justify-center gap-3"
              aria-label={`${pin.length} dígitos ingresados`}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`size-3.5 rounded-full ${index < pin.length ? 'bg-foreground' : 'bg-muted'}`}
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
              onChange={setPin}
              maxLength={6}
              onSubmit={submit}
              submitLabel={busy ? '…' : 'Entrar'}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">¿Quién eres?</h1>
            {users.isLoading || !online ? (
              <Spinner label={online ? 'Cargando…' : 'Buscando el servidor…'} />
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              {(users.data ?? []).map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setSelected(user);
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 shadow-soft active:scale-95"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-muted font-bold">
                    {initials(user.name)}
                  </span>
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.roleName}</span>
                </button>
              ))}
            </div>
            {pwaMode === 'insecure' ? (
              <p className="text-xs text-muted-foreground">
                Conexión HTTP: la app funciona y guarda pedidos sin red. Para instalarla como app,
                pide al administrador el certificado del local.
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
