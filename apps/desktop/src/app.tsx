import { useSession } from '@karbon/client';
import { Permission } from '@karbon/types';
import { ErrorScreen, Spinner } from '@karbon/ui';
import { lazy, type ReactNode, Suspense } from 'react';
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router';
import { AppShell } from './components/app-shell';
import { landingPath } from './lib/navigation';
import { LoginPage } from './pages/login-page';

// Cada módulo se carga al entrar: el arranque del POS y del KDS es inmediato.
const TablesPage = lazy(() => import('./pages/tables/tables-page'));
const OrderPage = lazy(() => import('./pages/orders/order-page'));
const OrdersPage = lazy(() => import('./pages/orders/orders-page'));
const KdsPage = lazy(() => import('./pages/kds/kds-page'));
const CashPage = lazy(() => import('./pages/cash/cash-page'));
const InventoryPage = lazy(() => import('./pages/inventory/inventory-page'));
const CatalogPage = lazy(() => import('./pages/catalog/catalog-page'));
const CustomersPage = lazy(() => import('./pages/customers/customers-page'));
const ReportsPage = lazy(() => import('./pages/reports/reports-page'));
const SettingsPage = lazy(() => import('./pages/settings/settings-page'));
const SetupPage = lazy(() => import('./pages/setup-page'));

function Loading() {
  return (
    <div className="grid h-full min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  return useSession() ? children : <Navigate to="/ingresar" replace />;
}

function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const session = useSession();
  if (!session) return <Navigate to="/ingresar" replace />;
  return session.user.permissions.includes(permission) ? (
    children
  ) : (
    <Navigate to={landingPath(session.user.permissions) ?? '/ingresar'} replace />
  );
}

function Home() {
  const session = useSession();
  const home = session ? landingPath(session.user.permissions) : null;
  return <Navigate to={home ?? '/ingresar'} replace />;
}

const guarded = (permission: Permission, page: ReactNode): ReactNode => (
  <RequirePermission permission={permission}>
    <Suspense fallback={<Loading />}>{page}</Suspense>
  </RequirePermission>
);

/** Un módulo que falla muestra un aviso en su lugar; el menú sigue disponible. */
function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}

const router = createHashRouter([
  { path: '/ingresar', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/configuracion-inicial',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<Loading />}>
        <SetupPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: 'mesas', element: guarded(Permission.TABLES_READ, <TablesPage />) },
          { path: 'pedidos', element: guarded(Permission.ORDERS_READ, <OrdersPage />) },
          { path: 'pedidos/:orderId', element: guarded(Permission.ORDERS_READ, <OrderPage />) },
          { path: 'kds', element: guarded(Permission.KITCHEN_READ, <KdsPage />) },
          { path: 'caja', element: guarded(Permission.CASH_READ, <CashPage />) },
          { path: 'inventario', element: guarded(Permission.INVENTORY_READ, <InventoryPage />) },
          { path: 'catalogo', element: guarded(Permission.CATALOG_WRITE, <CatalogPage />) },
          { path: 'clientes', element: guarded(Permission.CUSTOMERS_READ, <CustomersPage />) },
          { path: 'reportes', element: guarded(Permission.REPORTS_READ, <ReportsPage />) },
          { path: 'configuracion', element: guarded(Permission.SETTINGS_READ, <SettingsPage />) },
          { path: '*', element: <Home /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
