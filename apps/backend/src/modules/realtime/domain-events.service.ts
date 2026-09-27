import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/** Eventos internos del servidor (no viajan a las terminales). */
export interface DomainEventMap {
  /** Comandas recién enviadas: se imprimen en las impresoras de cocina/barra. */
  'tickets.sent': { ticketIds: string[] };
  /** Cierre de caja: dispara el respaldo automático. */
  'cash.closed': { sessionId: string };
}

type Handler<K extends keyof DomainEventMap> = (payload: DomainEventMap[K]) => Promise<void> | void;

/**
 * Bus en proceso para efectos secundarios que no deben bloquear ni revertir la operación
 * principal (imprimir, respaldar). Un fallo del manejador se registra y no se propaga.
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly emitter = new EventEmitter();

  on<K extends keyof DomainEventMap>(event: K, handler: Handler<K>): void {
    this.emitter.on(event, (payload: DomainEventMap[K]) => {
      Promise.resolve(handler(payload)).catch((error: unknown) => {
        this.logger.warn(
          `Fallo al procesar ${event}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }

  emit<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]): void {
    this.emitter.emit(event, payload);
  }
}
