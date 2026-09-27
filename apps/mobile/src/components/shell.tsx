import {
  useAuthActions,
  useRealtimeConnected,
  useSession,
  useSettings,
  useTerminology,
} from '@karbon/client';
import { Button, cn, StatusDot, ThemeToggle } from '@karbon/ui';
import { LayoutGridIcon, LogOutIcon, ReceiptTextIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { OutboxButton } from './outbox-button';
import { ReadyNotifier } from './ready-notifier';

const TABS = [
  { to: '/', label: 'Mesas', icon: LayoutGridIcon },
  { to: '/mis-pedidos', label: 'Mis pedidos', icon: ReceiptTextIcon },
] as const;

/** Marco de la terminal del mesero: estado de conexión, cola sin red y navegación inferior. */
export function Shell() {
  const session = useSession();
  const settings = useSettings().data;
  const terms = useTerminology();
  const connected = useRealtimeConnected();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showTabs = TABS.some((tab) => tab.to === pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand font-black text-primary">
          K
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{settings?.name ?? 'Karbon'}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <StatusDot
              className={connected ? 'bg-status-free' : 'animate-pulse bg-urgency-critical'}
            />
            {session?.user.name} · {connected ? terms.venue : 'Sin conexión'}
          </p>
        </div>
        <OutboxButton />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Salir"
          onClick={() => {
            void logout().then(() => navigate('/ingresar'));
          }}
        >
          <LogOutIcon />
        </Button>
      </header>

      <main className={cn('flex flex-1 flex-col', showTabs && 'pb-20')}>
        <Outlet />
      </main>

      {showTabs ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t bg-background pb-[env(safe-area-inset-bottom)]"
          aria-label="Secciones"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <tab.icon className="size-6" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <ReadyNotifier />
    </div>
  );
}
