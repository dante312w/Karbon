import { useApi, usePrinters } from '@karbon/client';
import {
  type PrinterDto,
  PrinterConnection,
  PrinterKind,
  PrinterPurpose,
  type ReceiptDocument,
} from '@karbon/types';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptView } from '../components/receipt-view';
import { resolveAssetUrl, useRuntime } from './runtime-context';

type PrintSource = { kind: 'order'; orderId: string } | { kind: 'invoice'; invoiceId: string };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Copia las reglas CSS de la app: el comprobante usa las mismas clases de Tailwind. */
function collectCss(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
    } catch {
      // Hojas de otro origen no son legibles; la app no usa ninguna.
    }
  }
  return rules.join('\n');
}

/** HTML autocontenido (estilos incluidos) para imprimir o exportar a PDF fuera de la app. */
function documentHtml(title: string, content: ReactElement, paperWidthMm: number | null): string {
  const body = renderToStaticMarkup(content);
  const pageCss = paperWidthMm
    ? `@page { size: ${paperWidthMm}mm auto; margin: 0 } body > * { width: ${paperWidthMm - 6}mm; padding: 2mm }`
    : '@page { size: A4; margin: 15mm } body > * { max-width: 180mm; font-size: 13px }';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${collectCss()}
${pageCss}
html, body { background: #fff; margin: 0 }</style></head><body>${body}</body></html>`;
}

function receiptHtml(receipt: ReceiptDocument, paperWidthMm: number | null): string {
  return documentHtml(
    receipt.title,
    <ReceiptView document={receipt} paper={paperWidthMm ? 'thermal' : 'a4'} />,
    paperWidthMm,
  );
}

/** Impresión desde un navegador (KDS o caja web): iframe oculto + diálogo del sistema. */
function printInBrowser(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // `print()` bloquea hasta cerrar el diálogo; el retraso evita cortar la vista previa.
      window.setTimeout(() => {
        frame.remove();
        resolve();
      }, 500);
    };
    document.body.append(frame);
  });
}

function thermalWidth(printer: PrinterDto | null): number | null {
  if (!printer) return 80;
  return printer.kind === PrinterKind.THERMAL ? printer.paperWidthMm : null;
}

/**
 * Impresión de comprobantes con la impresora de caja configurada:
 * red → ESC/POS desde el servidor; sistema/USB → controlador del sistema operativo (Electron);
 * sin impresora o en navegador → diálogo de impresión.
 */
export function useReceiptPrinter() {
  const api = useApi();
  const { desktop, apiBaseUrl } = useRuntime();
  const printers = usePrinters().data ?? [];
  const printer =
    printers.find(
      (candidate) => candidate.isActive && candidate.purposes.includes(PrinterPurpose.RECEIPT),
    ) ?? null;

  const loadDocument = async (source: PrintSource): Promise<ReceiptDocument> => {
    const receipt = await (source.kind === 'order'
      ? api.orders.receipt(source.orderId)
      : api.invoices.document(source.invoiceId));
    // El HTML se imprime fuera de la app (otra ventana u origen): el logo necesita URL absoluta.
    const logoUrl = resolveAssetUrl(receipt.business.logoUrl, apiBaseUrl || window.location.origin);
    return { ...receipt, business: { ...receipt.business, logoUrl } };
  };

  const print = async (
    source: PrintSource,
    options: { openDrawer?: boolean } = {},
  ): Promise<void> => {
    if (printer?.connection === PrinterConnection.NETWORK) {
      await (source.kind === 'order'
        ? api.orders.printReceipt(source.orderId, printer.id)
        : api.invoices.print(source.invoiceId, printer.id, options.openDrawer ?? false));
      return;
    }
    await printOnReceiptPrinter(receiptHtml(await loadDocument(source), thermalWidth(printer)));
  };

  /** Documento propio (p. ej. cierre de caja) en la impresora de caja vía el sistema operativo. */
  const printOnReceiptPrinter = async (html: string): Promise<void> => {
    const systemPrinter = printer?.connection === PrinterConnection.NETWORK ? null : printer;
    if (window.karbon && desktop) {
      const width = thermalWidth(systemPrinter);
      await window.karbon.printHtml({
        html,
        ...(systemPrinter?.address ? { deviceName: systemPrinter.address } : {}),
        ...(width ? { paperWidthMm: width } : {}),
        silent: Boolean(systemPrinter),
      });
      return;
    }
    await printInBrowser(html);
  };

  const printElement = (title: string, content: ReactElement): Promise<void> =>
    printOnReceiptPrinter(
      documentHtml(
        title,
        content,
        thermalWidth(printer?.connection === PrinterConnection.NETWORK ? null : printer),
      ),
    );

  /** Factura A4 o PDF: siempre en hoja completa. */
  const printA4 = async (source: PrintSource): Promise<void> => {
    const html = receiptHtml(await loadDocument(source), null);
    if (window.karbon) await window.karbon.printHtml({ html });
    else await printInBrowser(html);
  };

  const savePdf = async (source: PrintSource, fileName: string): Promise<string | null> => {
    const html = receiptHtml(await loadDocument(source), null);
    if (window.karbon) return window.karbon.savePdf({ html, fileName });
    // En navegador el diálogo de impresión ofrece "Guardar como PDF".
    await printInBrowser(html);
    return null;
  };

  return { printer, print, printA4, savePdf, printElement, loadDocument };
}
