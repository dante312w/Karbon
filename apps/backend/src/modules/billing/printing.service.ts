import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  type KitchenStation,
  PrinterConnection,
  PrinterPurpose,
  type ReceiptDocument,
} from '@karbon/types';
import { STATION_LABEL } from '@karbon/utils';
import { createConnection } from 'node:net';
import { DomainError, invalid, notFound } from '../../common/errors/domain-error.js';
import type { Printer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TICKET_INCLUDE, toTicketDtoWithOrder } from '../orders/orders.mapper.js';
import { DomainEventsService } from '../realtime/domain-events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { columnsForPaper, EscPosBuilder } from './escpos/escpos-builder.js';
import { formatKitchenTicket, formatReceipt } from './escpos/receipt-formatter.js';

const DEFAULT_RAW_PORT = 9100;
const TIMEOUT_MS = 5_000;

const PURPOSE_BY_STATION: Readonly<Record<KitchenStation, PrinterPurpose>> = {
  KITCHEN: PrinterPurpose.KITCHEN,
  BAR: PrinterPurpose.BAR,
};

export function parsePrinterAddress(address: string): { host: string; port: number } {
  const [host, port] = address.trim().split(':');
  return { host: host ?? '', port: port ? Number(port) : DEFAULT_RAW_PORT };
}

/**
 * Impresión ESC/POS por red (puerto RAW 9100). Las impresoras USB o del sistema operativo las
 * atiende la app de escritorio con el controlador de Windows.
 */
@Injectable()
export class PrintingService implements OnModuleInit {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  onModuleInit(): void {
    this.domainEvents.on('tickets.sent', ({ ticketIds }) => this.printKitchenTickets(ticketIds));
  }

  async printReceipt(
    document: ReceiptDocument,
    printerId: string,
    openDrawer = false,
  ): Promise<void> {
    const printer = await this.requireNetworkPrinter(printerId);
    await this.send(
      printer,
      formatReceipt(document, columnsForPaper(printer.paperWidthMm), openDrawer),
    );
  }

  async printTest(printerId: string): Promise<void> {
    const printer = await this.requireNetworkPrinter(printerId);
    const settings = await this.settings.get();
    const columns = columnsForPaper(printer.paperWidthMm);
    const bytes = new EscPosBuilder(columns)
      .align('center')
      .bold(true)
      .line('Karbon POS')
      .bold(false)
      .line(settings.name)
      .line(`Prueba de impresión · ${printer.name}`)
      .line('áéíóú ñÑ ¿¡ €')
      .separator()
      .feed(3)
      .cut()
      .build();
    await this.send(printer, bytes);
  }

  async printKitchenTickets(ticketIds: readonly string[]): Promise<void> {
    if (ticketIds.length === 0) return;
    const [tickets, printers, settings] = await Promise.all([
      this.prisma.kitchenTicket.findMany({
        where: { id: { in: [...ticketIds] } },
        include: TICKET_INCLUDE,
      }),
      this.prisma.printer.findMany({
        where: { isActive: true, connection: PrinterConnection.NETWORK },
      }),
      this.settings.get(),
    ]);
    for (const ticket of tickets) {
      const targets = printers.filter((printer) =>
        printer.purposes.includes(PURPOSE_BY_STATION[ticket.station]),
      );
      for (const printer of targets) {
        const bytes = formatKitchenTicket(
          toTicketDtoWithOrder(ticket),
          STATION_LABEL[ticket.station],
          columnsForPaper(printer.paperWidthMm),
          settings.locale,
        );
        try {
          await this.send(printer, bytes);
        } catch (error) {
          // La comanda ya está en el KDS: un fallo de papel o red no debe frenar el pedido.
          this.logger.warn(
            `No se imprimió la comanda ${ticket.id} en ${printer.name}: ${String(error)}`,
          );
        }
      }
    }
  }

  async reprintTicket(ticketId: string): Promise<void> {
    await this.printKitchenTickets([ticketId]);
  }

  private async requireNetworkPrinter(printerId: string): Promise<Printer> {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer?.isActive) throw notFound('La impresora');
    if (printer.connection !== PrinterConnection.NETWORK || !printer.address) {
      throw invalid(
        ErrorCode.PRINTER_NOT_SUPPORTED,
        'Esta impresora se atiende desde la app de escritorio (USB o controlador de Windows)',
      );
    }
    return printer;
  }

  private send(printer: Printer, bytes: Buffer): Promise<void> {
    const { host, port } = parsePrinterAddress(printer.address ?? '');
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      const fail = (reason: string): void => {
        socket.destroy();
        reject(
          new DomainError(
            ErrorCode.PRINTER_UNREACHABLE,
            `Impresora ${printer.name}: ${reason}`,
            HttpStatus.BAD_GATEWAY,
          ),
        );
      };
      socket.setTimeout(TIMEOUT_MS, () => {
        fail('no responde');
      });
      socket.once('error', (error) => {
        fail(error.message);
      });
      socket.once('connect', () => {
        socket.end(bytes, () => {
          resolve();
        });
      });
    });
  }
}
