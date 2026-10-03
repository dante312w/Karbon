import { Injectable, Logger } from '@nestjs/common';
import {
  type ClientToServerEvents,
  type EventEnvelope,
  type ServerToClientEvents,
  type SocketEvent,
  type SocketEventMap,
  SocketRoom,
  userRoom,
} from '@karbon/types';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';

export type KarbonServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Destinos por evento (docs/API.md). */
export const EVENT_ROOMS = {
  // Los meseros también: su lista de pedidos abiertos y el mapa se mantienen sin recargar.
  orderCreated: [SocketRoom.CASHIER, SocketRoom.ADMIN, SocketRoom.KITCHEN, SocketRoom.WAITERS],
  orderUpdated: [SocketRoom.KITCHEN, SocketRoom.CASHIER, SocketRoom.WAITERS, SocketRoom.ADMIN],
  tableChanged: [SocketRoom.WAITERS, SocketRoom.CASHIER, SocketRoom.ADMIN],
  /** Más la sala propia del mesero del pedido, que agrega quien publica. */
  kitchenReady: [SocketRoom.CASHIER],
  kitchenDelivered: [SocketRoom.KITCHEN, SocketRoom.CASHIER, SocketRoom.ADMIN],
  inventoryUpdated: [SocketRoom.ADMIN],
  cashClosed: [SocketRoom.ADMIN, SocketRoom.CASHIER],
  /** Llamados internos: más la sala propia de quien llamó, que agrega quien publica. */
  staffCallWaiter: [SocketRoom.WAITERS],
  staffCallCashier: [SocketRoom.CASHIER],
  /** Quienes toman pedidos (caja y meseros) y el catálogo. */
  noteOptionsChanged: [SocketRoom.WAITERS, SocketRoom.CASHIER, SocketRoom.ADMIN],
} as const;

/**
 * Publica eventos de dominio a las terminales. Se llama después de confirmar la transacción:
 * un evento nunca anuncia datos que luego se revierten.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private server: KarbonServer | null = null;

  attach(server: KarbonServer): void {
    this.server = server;
  }

  publish<E extends SocketEvent>(
    event: E,
    data: SocketEventMap[E],
    rooms: readonly string[],
  ): void {
    if (!this.server || rooms.length === 0) return;
    this.emit(this.server.to([...rooms]), event, data);
  }

  broadcast<E extends SocketEvent>(event: E, data: SocketEventMap[E]): void {
    if (!this.server) return;
    this.emit(this.server, event, data);
  }

  /** Usuarios con al menos un equipo conectado ahora (servidor único: salas en memoria). */
  connectedUsers(userIds: readonly string[]): Set<string> {
    const rooms = this.server?.sockets.adapter.rooms;
    return new Set(userIds.filter((id) => (rooms?.get(userRoom(id))?.size ?? 0) > 0));
  }

  private emit<E extends SocketEvent>(target: object, event: E, data: SocketEventMap[E]): void {
    const envelope: EventEnvelope<SocketEventMap[E]> = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      data,
    };
    // socket.io no puede resolver el tipo del payload con un evento genérico; la firma
    // pública de publish/broadcast ya garantiza que evento y datos corresponden.
    const emitter = target as { emit: (event: string, payload: unknown) => boolean };
    try {
      emitter.emit(event, envelope);
    } catch (error) {
      this.logger.warn(`No se pudo emitir ${event}: ${String(error)}`);
    }
  }
}
