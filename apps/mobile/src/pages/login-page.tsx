import { ApiError, queryKeys, useApi, useAuthActions, useSession } from '@karbon/client';
import { PIN_PATTERN, type PinUserOption } from '@karbon/types';
import {
  ConnectionBadge,
  errorMessage,
  PinEntry,
  PinUserGrid,
  Spinner,
  useServerHealth,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { usePwaMode } from '../lib/pwa-mode';

const DEVICE_NAME = 'Celular';

/** Ingreso rápido con PIN: el mesero toca su nombre y digita su clave numérica. */
export function LoginPage() {
  const api = useApi();
  const session = useSession();
  const pwaMode = usePwaMode();
  const connection = useServerHealth('');
  const { loginWithPin } = useAuthActions();
  const online = connection.status === 'online' || connection.status === 'degraded';
  const users = useQuery({
    queryKey: queryKeys.pinUsers,
    queryFn: api.auth.pinUsers,
    enabled: online,
  });
  const [selected, setSelected] = useState<PinUserOption | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = (): void => {
    if (!selected || busy || !PIN_PATTERN.test(pin)) return;
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
          <PinEntry
            user={selected}
            pin={pin}
            onPinChange={setPin}
            error={error}
            busy={busy}
            onSubmit={submit}
            onBack={() => {
              setSelected(null);
              setPin('');
              setError(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold">¿Quién eres?</h1>
            {users.isLoading || !online ? (
              <Spinner label={online ? 'Cargando…' : 'Buscando el servidor…'} />
            ) : null}
            <PinUserGrid users={users.data ?? []} onSelect={setSelected} />
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
