import type { AddOrderItemsRequest, CreateOrderRequest, OrderDto } from '@karbon/types';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { v7 as uuidv7 } from 'uuid';
import type { KarbonApi } from '../api';
import { ApiError, NetworkError } from '../http-client';

export type OutboxOperation =
  | { kind: 'createOrder'; body: CreateOrderRequest & { id: string } }
  | { kind: 'addItems'; orderId: string; body: AddOrderItemsRequest };

export interface OutboxEntry {
  /** También es la Idempotency-Key: reenviar nunca duplica. */
  id: string;
  createdAt: number;
  operation: OutboxOperation;
  attempts: number;
  /** Rechazada por el servidor (p. ej. mesa ocupada): requiere revisión del mesero. */
  failed: boolean;
  lastError: string | null;
}

interface OutboxSchema extends DBSchema {
  entries: { key: string; value: OutboxEntry };
}

export interface SendResult {
  queued: boolean;
  order: OrderDto | null;
}

/**
 * Cola de operaciones pendientes en IndexedDB. Disponible también en HTTP (sin Service Worker),
 * así que un mesero nunca pierde un pedido por una caída de WiFi.
 */
export class Outbox {
  private readonly db: Promise<IDBPDatabase<OutboxSchema>>;
  private readonly listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;

  constructor(name = 'karbon-outbox') {
    this.db = openDB<OutboxSchema>(name, 1, {
      upgrade(database) {
        database.createObjectStore('entries', { keyPath: 'id' });
      },
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(): Promise<OutboxEntry[]> {
    const entries = await (await this.db).getAll('entries');
    return entries.sort((a, b) => a.createdAt - b.createdAt);
  }

  async enqueue(operation: OutboxOperation, id: string = uuidv7()): Promise<OutboxEntry> {
    const entry: OutboxEntry = {
      id,
      createdAt: Date.now(),
      operation,
      attempts: 0,
      failed: false,
      lastError: null,
    };
    await (await this.db).put('entries', entry);
    this.notify();
    return entry;
  }

  async remove(id: string): Promise<void> {
    await (await this.db).delete('entries', id);
    this.notify();
  }

  /** Intenta en línea; si no hay red, encola para reenviar después. */
  async send(api: KarbonApi, operation: OutboxOperation): Promise<SendResult> {
    const key = uuidv7();
    try {
      return { queued: false, order: await execute(api, operation, key) };
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      await this.enqueue(operation, key);
      return { queued: true, order: null };
    }
  }

  /** Reenvía en orden. Se detiene al primer error de red; los rechazos quedan marcados. */
  flush(api: KarbonApi): Promise<void> {
    this.flushing ??= (async () => {
      for (const entry of await this.list()) {
        if (entry.failed) continue;
        try {
          await execute(api, entry.operation, entry.id);
          await this.remove(entry.id);
        } catch (error) {
          if (error instanceof NetworkError) break;
          const database = await this.db;
          await database.put('entries', {
            ...entry,
            attempts: entry.attempts + 1,
            failed: error instanceof ApiError && error.status < 500,
            lastError: error instanceof Error ? error.message : String(error),
          });
          this.notify();
        }
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function execute(api: KarbonApi, operation: OutboxOperation, key: string): Promise<OrderDto> {
  return operation.kind === 'createOrder'
    ? api.orders.create(operation.body, key)
    : api.orders.addItems(operation.orderId, operation.body, key);
}

export function newClientId(): string {
  return uuidv7();
}
