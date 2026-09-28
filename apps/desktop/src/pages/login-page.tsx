import { ApiError, queryKeys, useApi, useAuthActions, useSession } from '@karbon/client';
import { PIN_MAX_LENGTH, PIN_PATTERN, type PinUserOption } from '@karbon/types';
import {
  Button,
  Card,
  ConnectionBadge,
  EmptyState,
  Field,
  Input,
  PinEntry,
  PinUserGrid,
  Spinner,
  errorMessage,
  useServerHealth,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, LogOutIcon, ShieldOffIcon, UserRoundIcon } from 'lucide-react';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { BrandMark } from '../components/brand-mark';
import { landingPath } from '../lib/navigation';
import { useRuntime } from '../lib/runtime-context';

const DEVICE_NAME = 'Escritorio';

export function LoginPage() {
  const api = useApi();
  const runtime = useRuntime();
  const session = useSession();
  const navigate = useNavigate();
  const connection = useServerHealth(runtime.apiBaseUrl);
  const { loginWithPassword, loginWithPin, logout } = useAuthActions();
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [selected, setSelected] = useState<PinUserOption | null>(null);
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Solo se consultan con el servidor en línea: si arranca después que esta pantalla (equipo
  // recién encendido), la lista de usuarios aparece sola sin recargar.
  const online = connection.status === 'online' || connection.status === 'degraded';
  const users = useQuery({
    queryKey: queryKeys.pinUsers,
    queryFn: api.auth.pinUsers,
    enabled: online,
  });
  const setup = useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: api.system.setupStatus,
    retry: false,
    enabled: online,
  });

  useEffect(() => {
    if (setup.data?.required) void navigate('/configuracion-inicial', { replace: true });
  }, [setup.data, navigate]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        ApiError.is(caught, 'INVALID_CREDENTIALS')
          ? 'Datos incorrectos, intenta de nuevo'
          : errorMessage(caught),
      );
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const submitPin = (): void => {
    if (!selected || busy || !PIN_PATTERN.test(pin)) return;
    void run(() => loginWithPin(selected.id, pin, DEVICE_NAME));
  };

  const submitPassword = (event: SyntheticEvent): void => {
    event.preventDefault();
    void run(() => loginWithPassword(username, password, DEVICE_NAME));
  };

  // En caja se usa teclado físico: dígitos, borrar y Enter también funcionan en el PIN.
  useEffect(() => {
    if (mode !== 'pin' || !selected || busy) return;
    const onKey = (event: KeyboardEvent): void => {
      if (/^[0-9]$/.test(event.key))
        setPin((current) => (current + event.key).slice(0, PIN_MAX_LENGTH));
      else if (event.key === 'Backspace') setPin((current) => current.slice(0, -1));
      else if (event.key === 'Enter') submitPin();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const home = session ? landingPath(session.user.permissions) : null;
  if (home) return <Navigate to={home} replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.2fr]">
      <section className="hidden flex-col justify-between bg-brand p-10 text-brand-foreground lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <span className="text-xl font-bold">Karbon POS</span>
        </div>
        <div>
          <p className="text-4xl leading-tight font-bold">
            {setup.data?.restaurantName ?? 'Tu negocio'}
          </p>
          <p className="mt-2 text-brand-foreground/70">
            Punto de venta para restaurantes y bares · funciona sin internet
          </p>
        </div>
        <ConnectionBadge
          connection={connection}
          className="border-brand-foreground/20 text-brand-foreground"
        />
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-lg gap-5 p-6">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <span className="text-lg font-bold">Karbon POS</span>
          </div>

          {session ? (
            <EmptyState
              icon={ShieldOffIcon}
              title="Tu usuario no tiene módulos asignados"
              description="Pide al administrador que revise los permisos de tu rol."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    void logout();
                  }}
                >
                  <LogOutIcon /> Salir
                </Button>
              }
            />
          ) : mode === 'pin' ? (
            selected ? (
              <PinEntry
                user={selected}
                pin={pin}
                onPinChange={setPin}
                error={error}
                busy={busy}
                onSubmit={submitPin}
                onBack={() => {
                  setSelected(null);
                  setPin('');
                  setError(null);
                }}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-semibold">¿Quién eres?</h1>
                  <p className="text-sm text-muted-foreground">
                    Elige tu usuario para ingresar con PIN
                  </p>
                </div>
                {users.isLoading ? <Spinner /> : null}
                <PinUserGrid users={users.data ?? []} onSelect={setSelected} />
                {users.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ningún usuario tiene PIN; ingresa con usuario y clave.
                  </p>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode('password');
                  }}
                >
                  <KeyRoundIcon /> Usar usuario y clave
                </Button>
              </div>
            )
          ) : (
            <form className="flex flex-col gap-4" onSubmit={submitPassword}>
              <h1 className="text-xl font-semibold">Ingresar</h1>
              <Field label="Usuario">
                {(id) => (
                  <Input
                    id={id}
                    autoComplete="username"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                    }}
                    required
                  />
                )}
              </Field>
              <Field label="Clave">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                    }}
                    required
                  />
                )}
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? 'Ingresando…' : 'Ingresar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('pin');
                }}
              >
                <UserRoundIcon /> Ingreso rápido con PIN
              </Button>
            </form>
          )}
        </Card>
      </section>
    </div>
  );
}
