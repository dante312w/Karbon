import { useSession } from '@karbon/client';
import { ErrorScreen, Spinner } from '@karbon/ui';
import { lazy, type ReactNode, Suspense } from 'react';
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router';
import { Shell } from './components/shell';
import { LoginPage } from './pages/login-page';
import { TablesPage } from './pages/tables-page';

const MyOrdersPage = lazy(() => import('./pages/my-orders-page'));
const OrderPage = lazy(() => import('./pages/order-page'));
const TakeOrderPage = lazy(() => import('./pages/take-order-page'));

function RequireSession({ children }: { children: ReactNode }) {
  return useSession() ? children : <Navigate to="/ingresar" replace />;
}

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid flex-1 place-items-center p-10">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Una pantalla que falla muestra un aviso en su lugar; las pestañas siguen disponibles. */
function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}

const router = createHashRouter([
  { path: '/ingresar', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <Shell />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <TablesPage /> },
          { path: 'mis-pedidos', element: <Lazy>{<MyOrdersPage />}</Lazy> },
          { path: 'pedido/:orderId', element: <Lazy>{<OrderPage />}</Lazy> },
          // Agregar a un pedido existente o crear uno nuevo (mesa o cuenta sin mesa).
          { path: 'pedido/:orderId/agregar', element: <Lazy>{<TakeOrderPage />}</Lazy> },
          { path: 'nuevo', element: <Lazy>{<TakeOrderPage />}</Lazy> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
