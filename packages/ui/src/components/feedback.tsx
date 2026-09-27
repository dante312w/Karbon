import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '../theme/theme-context';
import { Button } from './button';
import { EmptyState } from './layout';

/** Notificaciones de la app (éxitos, errores de la API, avisos de cocina/barra). */
export function Toaster() {
  const { resolved } = useTheme();
  return <SonnerToaster theme={resolved} position="top-center" richColors closeButton />;
}

/** Texto del error para soporte (errores de JavaScript o respuestas del enrutador). */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const text = 'statusText' in error ? String(error.statusText) : '';
    return `${String(error.status)} ${text}`.trim();
  }
  return String(error);
}

/**
 * Pantalla que reemplaza a un módulo que falló al mostrarse: el resto de la app (menú, otros
 * módulos) sigue funcionando y el detalle técnico queda a mano para soporte.
 */
export function ErrorScreen({ error }: { error: unknown }) {
  return (
    <EmptyState
      className="min-h-[60vh]"
      icon={TriangleAlertIcon}
      title="Esta pantalla no se pudo mostrar"
      description="Recarga para intentarlo de nuevo. Si acabas de actualizar Karbon y sigue pasando, reinicia el programa en el PC servidor."
      action={
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            <RotateCwIcon /> Recargar
          </Button>
          <details className="max-w-xl text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer text-center">Detalle para soporte</summary>
            <pre className="mt-2 rounded-lg bg-muted p-3 break-words whitespace-pre-wrap">
              {describeError(error)}
            </pre>
          </details>
        </div>
      }
    />
  );
}
