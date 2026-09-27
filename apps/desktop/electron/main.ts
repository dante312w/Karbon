import { isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DESKTOP_APP_ORIGIN } from '@karbon/types';
import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron';
import {
  type DesktopAppInfo,
  IpcChannel,
  type PrintHtmlRequest,
  type SavePdfRequest,
  type ServerStatus,
} from '../shared/bridge';
import { listPrinters, printHtml, savePdf } from './printing';
import { ServerSupervisor } from './server/supervisor';
import { KarbonTray } from './tray';

/** URL del renderer en desarrollo (`--renderer-url=http://localhost:5173`). */
const rendererUrl = process.argv
  .find((arg) => arg.startsWith('--renderer-url='))
  ?.slice('--renderer-url='.length);

/** Arranque automático con Windows: el servidor sube sin mostrar la ventana. */
const startHidden = process.argv.includes('--hidden');

/**
 * Instalación real (o `--embedded` en desarrollo): este equipo es el servidor del
 * restaurante. En desarrollo normal se usa el backend de `npm run dev`.
 */
const embedded = app.isPackaged || process.argv.includes('--embedded');

// Una instalación real y el desarrollo en el mismo equipo no comparten base de datos.
if (!app.isPackaged)
  app.setPath('userData', join(app.getPath('appData'), 'Karbon POS (desarrollo)'));

const supervisor = embedded ? new ServerSupervisor() : null;
let serverUrl = process.env.KARBON_SERVER_URL ?? 'http://localhost:3000';

const RENDERER_DIR = join(import.meta.dirname, '..', 'dist');
const APP_SCHEME = new URL(DESKTOP_APP_ORIGIN).protocol.replace(':', '');

let mainWindow: BrowserWindow | null = null;
let tray: KarbonTray | null = null;
let quitting = false;
let hintShown = false;

/**
 * El build se sirve por un protocolo propio (`app://karbon`) y no por `file://`: así tiene un
 * origen estable que el CORS del backend puede aceptar y no expone el sistema de archivos.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveRendererBuild(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const filePath = join(
      RENDERER_DIR,
      decodeURIComponent(pathname === '/' ? '/index.html' : pathname),
    );
    const pathFromRoot = relative(RENDERER_DIR, filePath);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function isAppNavigation(url: string): boolean {
  return url.startsWith(rendererUrl ?? `${DESKTOP_APP_ORIGIN}/`);
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0e0b17',
    title: 'Karbon POS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  // Cerrar la ventana no apaga el servidor: los celulares siguen trabajando.
  window.on('close', (event) => {
    if (quitting || !supervisor) return;
    event.preventDefault();
    window.hide();
    if (!hintShown) {
      hintShown = true;
      tray?.showBalloon('Karbon sigue atendiendo a los celulares desde la bandeja del sistema.');
    }
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro de la app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppNavigation(url)) event.preventDefault();
  });

  void window.loadURL(rendererUrl ?? `${DESKTOP_APP_ORIGIN}/index.html`);
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.APP_INFO, (): DesktopAppInfo => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    platform: process.platform,
    serverUrl,
    autoStart: app.getLoginItemSettings().openAtLogin,
  }));
  ipcMain.handle(IpcChannel.LIST_PRINTERS, (event) => listPrinters(event.sender));
  ipcMain.handle(IpcChannel.PRINT_HTML, (_event, request: PrintHtmlRequest) => printHtml(request));
  ipcMain.handle(IpcChannel.SAVE_PDF, (event, request: SavePdfRequest) =>
    savePdf(request, BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle(
    IpcChannel.SERVER_STATUS,
    (): ServerStatus =>
      supervisor?.status ?? { state: 'running', message: null, waiterAppUrls: [] },
  );
  ipcMain.handle(IpcChannel.SET_AUTO_START, (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
    return app.getLoginItemSettings().openAtLogin;
  });
}

/** Apagado ordenado: backend primero, luego PostgreSQL (checkpoint limpio). */
async function shutdown(): Promise<void> {
  try {
    await supervisor?.stop();
  } finally {
    app.exit(0);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  void app.whenReady().then(async () => {
    // Ningún permiso del navegador (cámara, micrófono, geolocalización…) se concede por defecto.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    serveRendererBuild();
    registerIpcHandlers();

    if (supervisor) {
      await supervisor.prepare();
      serverUrl = supervisor.serverUrl;
      tray = new KarbonTray(supervisor.paths.trayIcon, {
        open: showMainWindow,
        quit: () => {
          quitting = true;
          app.quit();
        },
      });
      tray.update(supervisor.status);
      supervisor.onChange((status) => {
        tray?.update(status);
      });
      void supervisor.start();
    }

    if (!startHidden) showMainWindow();

    app.on('activate', showMainWindow);
  });

  app.on('before-quit', (event) => {
    quitting = true;
    if (!supervisor) return;
    event.preventDefault();
    void shutdown();
  });

  app.on('window-all-closed', () => {
    // Con servidor embebido la app vive en la bandeja; sin él, cerrar la ventana es salir.
    if (!supervisor && process.platform !== 'darwin') app.quit();
  });
}
