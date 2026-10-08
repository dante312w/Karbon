import type { DesktopAppInfo } from '../../shared/bridge';

export interface RuntimeContext {
  /** Base de las llamadas a la API. Vacía = mismo origen. */
  apiBaseUrl: string;
  /** `null` cuando el renderer corre en un navegador (p. ej. el KDS en una tablet). */
  desktop: DesktopAppInfo | null;
}

export async function resolveRuntime(): Promise<RuntimeContext> {
  if (!window.karbon) {
    return { apiBaseUrl: '', desktop: null };
  }
  const desktop = await window.karbon.getAppInfo();
  return { apiBaseUrl: desktop.serverUrl, desktop };
}
