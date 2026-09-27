import {
  useAuthActions,
  useRealtimeConnected,
  useSession,
  useSettings,
  useTerminology,
} from '@karbon/client';
import { Badge, Button, cn, StatusDot, ThemeToggle } from '@karbon/ui';
import { LogOutIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { type NavItem, navItems } from '../lib/navigation';
import { BrandMark } from './brand-mark';

export function AppShell() {
  const session = useSession();
  const settings = useSettings().data;
  const terms = useTerminology();
  const connected = useRealtimeConnected();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const permissions = session?.user.permissions ?? [];
  const items = navItems(terms).filter((item) => permissions.includes(item.permission));
  const settingsItem = items.find((item) => item.to === '/configuracion');
  const moduleItems = items.filter((item) => item !== settingsItem);

  // Cada pantalla empieza arriba: el contenedor con scroll es compartido entre rutas.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-muted/30">
      <nav
        className="flex w-20 shrink-0 flex-col items-center bg-brand py-3 text-brand-foreground [@media(max-height:640px)]:py-2"
        aria-label="Módulos"
      >
        <BrandMark className="mb-3 size-11 shrink-0 [@media(max-height:640px)]:mb-2 [@media(max-height:640px)]:size-9" />
        {/* En pantallas bajas los módulos se desplazan; Configuración queda siempre visible abajo. */}
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
          {moduleItems.map((item) => (
            <ModuleLink key={item.to} item={item} />
          ))}
        </div>
        {settingsItem ? (
          <div className="mt-1 w-full shrink-0 border-t border-brand-foreground/15 pt-1 [&>a]:mx-auto">
            <ModuleLink item={settingsItem} />
          </div>
        ) : null}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{settings?.name ?? 'Karbon POS'}</span>
            <Badge variant="secondary">{terms.venue}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <StatusDot
                className={connected ? 'bg-status-free' : 'bg-urgency-critical animate-pulse'}
              />
              {connected ? 'En línea' : 'Reconectando…'}
            </span>
            <ThemeToggle />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session?.user.name} · {session?.user.role.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void logout().then(() => navigate('/ingresar'));
              }}
            >
              <LogOutIcon /> Salir
            </Button>
          </div>
        </header>
        <main ref={mainRef} className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ModuleLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition-colors [@media(max-height:640px)]:py-1.5',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-brand-foreground/70 hover:bg-brand-foreground/10 hover:text-brand-foreground',
        )
      }
    >
      <item.icon className="size-5" />
      <span className="max-w-full truncate px-1">{item.label}</span>
    </NavLink>
  );
}
