import { useApi, useAuthActions } from '@karbon/client';
import { BusinessMode } from '@karbon/types';
import { Button, cn, Field, Input, notifyError, Spinner, Switch } from '@karbon/ui';
import { getTerminology } from '@karbon/utils';
import { useQuery } from '@tanstack/react-query';
import { ChefHatIcon, MartiniIcon } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { BrandMark } from '../components/brand-mark';
import { landingPath } from '../lib/navigation';

const STEPS = ['Negocio', 'Administrador', 'Listo'] as const;
const USERNAME = /^[a-zA-Z0-9._-]{3,60}$/;

/** Asistente de primer arranque: nombre, modo restaurante/bar y cuenta de administrador. */
export default function SetupPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { start } = useAuthActions();
  const status = useQuery({
    queryKey: ['setup-status'],
    queryFn: api.system.setupStatus,
    retry: false,
  });
  const [step, setStep] = useState(0);
  const [restaurantName, setRestaurantName] = useState('');
  const [businessMode, setBusinessMode] = useState<BusinessMode>(BusinessMode.RESTAURANT);
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [loadDemoData, setLoadDemoData] = useState(true);
  const [busy, setBusy] = useState(false);

  if (status.isPending) {
    return (
      <div className="grid h-dvh place-items-center">
        <Spinner label="Conectando con el servidor…" />
      </div>
    );
  }
  if (status.data && !status.data.required) return <Navigate to="/ingresar" replace />;

  const businessValid = restaurantName.trim().length >= 2;
  const adminValid =
    adminName.trim().length >= 2 &&
    USERNAME.test(adminUsername) &&
    adminPassword.length >= 8 &&
    adminPassword === confirmation &&
    (adminPin === '' || /^\d{4,6}$/.test(adminPin));

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      const session = start(
        await api.system.completeSetup({
          restaurantName: restaurantName.trim(),
          businessMode,
          adminName: adminName.trim(),
          adminUsername: adminUsername.trim(),
          adminPassword,
          adminPin: adminPin || null,
          loadDemoData,
        }),
      );
      void navigate(landingPath(session.user.permissions), { replace: true });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 p-6">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border bg-background p-8 shadow-elevated">
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <h1 className="text-xl font-bold">Bienvenido a Karbon POS</h1>
            <p className="text-sm text-muted-foreground">Configuremos tu negocio en un minuto.</p>
          </div>
        </div>
        <ol className="flex gap-2" aria-label="Pasos">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 flex-col gap-1">
              <span
                className={cn('h-1.5 rounded-full', index <= step ? 'bg-primary' : 'bg-muted')}
              />
              <span
                className={cn(
                  'text-xs',
                  index === step ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <Field label="Nombre del negocio">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  placeholder="Ej. La Brasa"
                  value={restaurantName}
                  onChange={(event) => {
                    setRestaurantName(event.target.value);
                  }}
                />
              )}
            </Field>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Tipo de negocio"
            >
              {[
                {
                  mode: BusinessMode.RESTAURANT,
                  icon: ChefHatIcon,
                  text: 'Cocina y barra, mesas y meseros',
                },
                { mode: BusinessMode.BAR, icon: MartiniIcon, text: 'Todo se prepara en la barra' },
              ].map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={businessMode === option.mode}
                  onClick={() => {
                    setBusinessMode(option.mode);
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition',
                    businessMode === option.mode
                      ? 'border-primary bg-primary/10'
                      : 'hover:bg-accent',
                  )}
                >
                  <option.icon className="mt-0.5 size-6" />
                  <span>
                    <span className="block font-semibold">{getTerminology(option.mode).venue}</span>
                    <span className="text-sm text-muted-foreground">{option.text}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Puedes cambiarlo después en Configuración.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tu nombre" className="col-span-2">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  value={adminName}
                  onChange={(event) => {
                    setAdminName(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field
              label="Usuario"
              className="col-span-2"
              {...(USERNAME.test(adminUsername)
                ? {}
                : { error: '3 a 60 letras, números, punto o guion' })}
            >
              {(id) => (
                <Input
                  id={id}
                  autoComplete="username"
                  value={adminUsername}
                  onChange={(event) => {
                    setAdminUsername(event.target.value.toLowerCase());
                  }}
                />
              )}
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={adminPassword}
                  onChange={(event) => {
                    setAdminPassword(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field
              label="Repite la contraseña"
              {...(confirmation && confirmation !== adminPassword ? { error: 'No coincide' } : {})}
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field
              label="PIN de ingreso rápido (opcional)"
              className="col-span-2"
              hint="4 a 6 dígitos"
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  maxLength={6}
                  value={adminPin}
                  onChange={(event) => {
                    setAdminPin(event.target.value.replace(/\D/g, ''));
                  }}
                />
              )}
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-muted/60 p-4 text-sm">
              <dt className="text-muted-foreground">Negocio</dt>
              <dd>{restaurantName}</dd>
              <dt className="text-muted-foreground">Modo</dt>
              <dd>{getTerminology(businessMode).venue}</dd>
              <dt className="text-muted-foreground">Administrador</dt>
              <dd>
                {adminName} (@{adminUsername})
              </dd>
            </dl>
            <Switch
              checked={loadDemoData}
              onCheckedChange={setLoadDemoData}
              label={`Cargar datos de ejemplo (${businessMode === BusinessMode.BAR ? 'carta de bar' : 'carta de restaurante'}, mesas, insumos y usuarios de prueba)`}
            />
            <p className="text-xs text-muted-foreground">
              Los datos de ejemplo sirven para practicar; puedes editarlos o desactivarlos cuando
              quieras.
            </p>
          </div>
        ) : null}

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => {
              setStep(step - 1);
            }}
          >
            Atrás
          </Button>
          {step < 2 ? (
            <Button
              disabled={step === 0 ? !businessValid : !adminValid}
              onClick={() => {
                setStep(step + 1);
              }}
            >
              Siguiente
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={busy}
              onClick={() => {
                void finish();
              }}
            >
              {busy ? 'Preparando…' : 'Empezar a vender'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
