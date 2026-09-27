import type { IsoDateTime } from './common.js';

/**
 * Origen del renderer empaquetado de escritorio (protocolo propio de Electron en lugar de
 * `file://`, cuyo origen es `null`). El backend lo acepta siempre en CORS.
 */
export const DESKTOP_APP_ORIGIN = 'app://karbon';

export type ComponentHealth = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  database: ComponentHealth;
  timestamp: IsoDateTime;
}

/** Datos para que las terminales descubran y muestren cómo conectarse al servidor. */
export interface ServerInfo {
  name: string;
  version: string;
  /** URLs del servidor en la red local, p. ej. `http://192.168.1.10:3000`. */
  lanUrls: string[];
  /**
   * Dónde abren los celulares la app de meseros (con HTTPS si está activo). Vacío si nadie la
   * publica en esta red (p. ej. un backend de desarrollo sin los puertos de Vite configurados).
   */
  waiterAppUrls: string[];
  /** Dónde se abre el tablero de cocina/barra (KDS) desde una tablet o TV. */
  kdsUrls: string[];
}
