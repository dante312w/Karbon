import { createContext, useContext } from 'react';
import type { RuntimeContext as Runtime } from './runtime';

export const RuntimeContext = createContext<Runtime>({ apiBaseUrl: '', desktop: null });

/** ¿Corre en Electron (con impresión del sistema y bandeja) o en un navegador (KDS en tablet)? */
export function useRuntime(): Runtime {
  return useContext(RuntimeContext);
}

/**
 * Las imágenes (logo, productos) vienen como rutas del backend (`/api/v1/...`). En Electron el
 * renderer tiene otro origen (`app://karbon`), así que se resuelven contra el servidor.
 */
export function resolveAssetUrl(path: string | null, apiBaseUrl: string): string | null {
  if (!path) return null;
  return apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
}

export function useAssetUrl(): (path: string | null) => string | null {
  const { apiBaseUrl } = useRuntime();
  return (path) => resolveAssetUrl(path, apiBaseUrl);
}
