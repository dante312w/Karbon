import { registerSW } from 'virtual:pwa-register';

/**
 * - `secure`: HTTPS con la CA local instalada (o localhost). PWA instalable con caché del shell.
 * - `insecure`: HTTP en la LAN. Chrome no permite Service Worker; la app funciona igual,
 *   pero sin instalación ni arranque sin red.
 */
export type PwaMode = 'secure' | 'insecure';

export function registerServiceWorker(): PwaMode {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return 'insecure';
  void registerSW({ immediate: true });
  return 'secure';
}
