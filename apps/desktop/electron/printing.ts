import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog, type WebContents } from 'electron';
import type { PrintHtmlRequest, SavePdfRequest, SystemPrinter } from '../shared/bridge';

const MICRONS_PER_MM = 1_000;
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

/** Ventana oculta sin preload ni acceso a Node: solo renderiza el HTML del comprobante. */
async function renderHidden(html: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return window;
}

/** Alto real del contenido en mm, para que el rollo térmico no avance papel en blanco. */
async function contentHeightMm(contents: WebContents): Promise<number> {
  const pixels = (await contents.executeJavaScript(
    'document.documentElement.scrollHeight',
  )) as number;
  return Math.ceil((pixels / CSS_PX_PER_INCH) * MM_PER_INCH) + 5;
}

export async function listPrinters(contents: WebContents): Promise<SystemPrinter[]> {
  const printers = await contents.getPrintersAsync();
  return printers.map((printer) => {
    // Electron ya no expone `isDefault`; CUPS y Windows lo informan en las opciones.
    const options = printer.options as Record<string, string | undefined>;
    return {
      name: printer.name,
      displayName: printer.displayName,
      isDefault: options['printer-is-default'] === 'true' || options.isDefault === 'true',
    };
  });
}

export async function printHtml(request: PrintHtmlRequest): Promise<void> {
  const window = await renderHidden(request.html);
  try {
    const pageSize = request.paperWidthMm
      ? {
          width: request.paperWidthMm * MICRONS_PER_MM,
          height: (await contentHeightMm(window.webContents)) * MICRONS_PER_MM,
        }
      : ('A4' as const);
    await new Promise<void>((resolve, reject) => {
      window.webContents.print(
        {
          silent: request.silent ?? false,
          printBackground: true,
          margins: { marginType: request.paperWidthMm ? 'none' : 'default' },
          pageSize,
          ...(request.deviceName ? { deviceName: request.deviceName } : {}),
        },
        (success, failureReason) => {
          // Cancelar el diálogo no es un error.
          if (success || failureReason === 'cancelled') resolve();
          else reject(new Error(`No se pudo imprimir: ${failureReason}`));
        },
      );
    });
  } finally {
    window.destroy();
  }
}

export async function savePdf(
  request: SavePdfRequest,
  parent: BrowserWindow | null,
): Promise<string | null> {
  const options = {
    defaultPath: request.fileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const target = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (target.canceled || !target.filePath) return null;

  const window = await renderHidden(request.html);
  try {
    const pageSize = request.paperWidthMm
      ? {
          width: request.paperWidthMm / MM_PER_INCH,
          height: (await contentHeightMm(window.webContents)) / MM_PER_INCH,
        }
      : ('A4' as const);
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize });
    await writeFile(target.filePath, pdf);
    return target.filePath;
  } finally {
    window.destroy();
  }
}
