/**
 * Contrato entre el preload (proceso aislado con acceso a Electron) y el renderer React.
 * El renderer nunca accede a Node ni a Electron directamente: solo a `window.karbon`.
 * Cuando el mismo renderer se sirve por web (p. ej. el KDS en una tablet), `window.karbon`
 * no existe y la app usa el servidor del mismo origen.
 */
export const IpcChannel = {
  APP_INFO: 'app:get-info',
  LIST_PRINTERS: 'print:list-printers',
  PRINT_HTML: 'print:html',
  SAVE_PDF: 'print:save-pdf',
  SERVER_STATUS: 'server:status',
  SET_AUTO_START: 'app:set-auto-start',
} as const;

export interface DesktopAppInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  platform: string;
  /** URL del backend local que usa esta ventana. */
  serverUrl: string;
  /** ¿Arranca con Windows? */
  autoStart: boolean;
}

export interface SystemPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface PrintHtmlRequest {
  /** Documento HTML completo (con estilos en línea). */
  html: string;
  /** Impresora del sistema; vacío = predeterminada. */
  deviceName?: string;
  /** Ancho del papel térmico en mm; sin valor = hoja carta/A4. */
  paperWidthMm?: number;
  /** Sin diálogo de impresión (tickets de caja). */
  silent?: boolean;
}

export interface SavePdfRequest {
  html: string;
  fileName: string;
  paperWidthMm?: number;
}

/** Estado del servidor embebido que supervisa el proceso principal. */
export interface ServerStatus {
  state: 'starting' | 'running' | 'error';
  message: string | null;
  /** Dónde abren los celulares la app de meseros (la primera se copia desde la bandeja). */
  waiterAppUrls: string[];
}

export interface DesktopBridge {
  getAppInfo: () => Promise<DesktopAppInfo>;
  listPrinters: () => Promise<SystemPrinter[]>;
  printHtml: (request: PrintHtmlRequest) => Promise<void>;
  /** Devuelve la ruta guardada o `null` si el usuario canceló. */
  savePdf: (request: SavePdfRequest) => Promise<string | null>;
  serverStatus: () => Promise<ServerStatus>;
  setAutoStart: (enabled: boolean) => Promise<boolean>;
}
