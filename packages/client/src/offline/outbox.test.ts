import 'fake-indexeddb/auto';
import type { OrderDto } from '@karbon/types';
import { describe, expect, it, vi } from 'vitest';
import type { KarbonApi } from '../api';
import { ApiError, NetworkError } from '../http-client';
import { Outbox } from './outbox';

function fakeApi(create: (key?: string) => Promise<OrderDto>): KarbonApi {
  return {
    orders: { create: vi.fn((_body: unknown, key?: string) => create(key)), addItems: vi.fn() },
  } as unknown as KarbonApi;
}

const ORDER = { id: 'o1', number: 1 } as OrderDto;
const operation = { kind: 'createOrder' as const, body: { id: 'o1', label: 'Mesa 1' } };

describe('Outbox', () => {
  it('envía en línea sin encolar cuando hay conexión', async () => {
    const outbox = new Outbox(`test-${Math.random()}`);
    const result = await outbox.send(
      fakeApi(() => Promise.resolve(ORDER)),
      operation,
    );
    expect(result).toEqual({ queued: false, order: ORDER });
    expect(await outbox.list()).toHaveLength(0);
  });

  it('encola sin red y reenvía con la misma clave de idempotencia', async () => {
    const outbox = new Outbox(`test-${Math.random()}`);
    const keys: (string | undefined)[] = [];
    let online = false;
    const api = fakeApi((key) => {
      keys.push(key);
      return online
        ? Promise.resolve(ORDER)
        : Promise.reject(new NetworkError(new TypeError('offline')));
    });

    const result = await outbox.send(api, operation);
    expect(result.queued).toBe(true);
    expect(await outbox.list()).toHaveLength(1);

    online = true;
    await outbox.flush(api);
    expect(await outbox.list()).toHaveLength(0);
    expect(keys[0]).toBe(keys[1]);
  });

  it('marca como fallida una operación rechazada por el servidor', async () => {
    const outbox = new Outbox(`test-${Math.random()}`);
    await outbox.enqueue(operation);
    await outbox.flush(
      fakeApi(() => Promise.reject(new ApiError(409, 'TABLE_OCCUPIED', 'Mesa ocupada'))),
    );
    const [entry] = await outbox.list();
    expect(entry?.failed).toBe(true);
    expect(entry?.lastError).toBe('Mesa ocupada');
  });
});
