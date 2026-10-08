import type { DesktopBridge } from '../shared/bridge';

declare global {
  /** Identificador del build (lo define Vite). */
  const __KARBON_BUILD__: string;

  interface Window {
    /** Presente solo dentro de Electron (lo expone el preload). */
    karbon?: DesktopBridge;
  }
}

export {};
