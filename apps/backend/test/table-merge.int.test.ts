import type { AreaDto, OrderDto, ProductDto, TableDto } from '@karbon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiClient,
  EventProbe,
  type Harness,
  loginWithPassword,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/**
 * Unir mesas desde que se abren, con o sin pedido: queda una mesa principal con una sola cuenta
 * compartida; varias cuentas con consumo se confirman. Separar nunca pierde productos. Crea su
 * propia área y mesas.
 */
describe('Unir y separar mesas desde que se abren (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let laura: ApiClient;
  let andres: ApiClient;
  let kitchen: ApiClient;
  let andresProbe: EventProbe;
  let tables: TableDto[];
  let soda: ProductDto;

  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Falta la mesa ${name}`);
    return found;
  };
  const refresh = async (): Promise<void> => {
    tables = (await laura.get('/tables').expect(200)).body as TableDto[];
  };
  const code = (response: { body: unknown }): string => (response.body as { code: string }).code;
  /** Abrir la mesa como el celular: solo personas, sin productos. */
  const openEmpty = async (name: string, guests: number, client = laura): Promise<OrderDto> =>
    (await client.post('/orders', { tableId: table(name).id, guests }).expect(201))
      .body as OrderDto;
  const openWithSoda = async (name: string): Promise<OrderDto> =>
    (
      await laura
        .post('/orders', {
          tableId: table(name).id,
          guests: 2,
          items: [{ productId: soda.id, quantity: 1 }],
          send: true,
        })
        .expect(201)
    ).body as OrderDto;
  const order = async (id: string): Promise<OrderDto> =>
    (await admin.get(`/orders/${id}`).expect(200)).body as OrderDto;
  const merge = (main: string, children: string[], extra: object = {}) =>
    laura.post(`/tables/${table(main).id}/merge`, {
      tableIds: children.map((name) => table(name).id),
      ...extra,
    });

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    laura = await loginWithPin(harness, 'Laura', '2222');
    andres = await loginWithPin(harness, 'Andrés', '3333');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    andresProbe = new EventProbe(harness, andres.session.accessToken);
    await andresProbe.connected();

    const area = (await admin.post('/areas', { name: 'Uniones' }).expect(201)).body as AreaDto;
    for (let index = 1; index <= 9; index += 1) {
      await admin
        .post('/tables', {
          areaId: area.id,
          name: `Unión ${String(index)}`,
          capacity: 4,
          posX: index * 3,
          posY: 0,
        })
        .expect(201);
    }
    await refresh();
    const products = (await laura.get('/products').expect(200)).body as ProductDto[];
    const found = products.find((product) => product.name === 'Gaseosa 350 ml');
    if (!found) throw new Error('Producto Gaseosa 350 ml no está en el seed');
    soda = found;
  });

  afterAll(async () => {
    andresProbe.close();
    await harness.close();
  });

  it('abrir una mesa sin productos la ocupa en todos los equipos', async () => {
    const opened = await openEmpty('Unión 1', 3);
    expect(opened.items).toEqual([]);
    expect(opened.guests).toBe(3);
    await andresProbe.waitFor(
      'table.changed',
      (data) => data.table.id === table('Unión 1').id && data.table.status === 'OCCUPIED',
    );
  });

  it('une una mesa libre a una abierta sin pedido: el grupo queda ocupado con una cuenta', async () => {
    const before = table('Unión 1');
    await refresh();
    const merged = (await merge('Unión 1', ['Unión 2']).expect(201)).body as TableDto;
    expect(merged.activeOrders).toHaveLength(1);
    expect(merged.status).toBe('OCCUPIED');
    await andresProbe.waitFor(
      'table.changed',
      (data) =>
        data.table.id === table('Unión 2').id &&
        data.table.mergedIntoId === before.id &&
        data.table.status === 'OCCUPIED',
    );
    // Lo que se pida después cae en la cuenta compartida: no se abre otra en el grupo.
    const conflict = await laura
      .post('/orders', { tableId: table('Unión 2').id, guests: 1 })
      .expect(409);
    expect(code(conflict)).toBe('TABLE_OCCUPIED');
    const shared = merged.activeOrders[0]?.id ?? '';
    const added = (
      await laura
        .post(`/orders/${shared}/items`, { items: [{ productId: soda.id, quantity: 2 }] })
        .expect(201)
    ).body as OrderDto;
    expect(added.tableId).toBe(table('Unión 1').id);
    expect(added.items).toHaveLength(1);
  });

  it('dos mesas abiertas sin pedido: queda una sola cuenta y se suman las personas', async () => {
    const main = await openEmpty('Unión 3', 2);
    const child = await openEmpty('Unión 4', 4);
    const merged = (await merge('Unión 3', ['Unión 4']).expect(201)).body as TableDto;
    expect(merged.activeOrders.map((summary) => summary.id)).toEqual([main.id]);
    expect((await order(main.id)).guests).toBe(6);
    const absorbed = await order(child.id);
    expect(absorbed.status).toBe('CANCELLED');
    expect(absorbed.cancelReason).toContain('Unión 3');
  });

  it('mesa con pedido + mesa sin pedido (en cualquier orden): manda la cuenta con consumo', async () => {
    // La principal está vacía y la que se une ya pidió: su cuenta pasa a ser la compartida.
    const emptyMain = await openEmpty('Unión 5', 1);
    const withOrder = await openWithSoda('Unión 6');
    const merged = (await merge('Unión 5', ['Unión 6']).expect(201)).body as TableDto;
    expect(merged.activeOrders.map((summary) => summary.id)).toEqual([withOrder.id]);
    const shared = await order(withOrder.id);
    expect(shared.tableId).toBe(table('Unión 5').id);
    expect(shared.guests).toBe(3);
    expect(shared.items).toHaveLength(1);
    expect((await order(emptyMain.id)).status).toBe('CANCELLED');
  });

  it('dos mesas con consumo: pide confirmación y, confirmado, quedan cuentas separadas', async () => {
    const first = await openWithSoda('Unión 7');
    const second = await openWithSoda('Unión 8');
    const unconfirmed = await merge('Unión 7', ['Unión 8']).expect(409);
    expect(code(unconfirmed)).toBe('TABLE_MERGE_NEEDS_CONFIRMATION');
    await refresh();
    expect(table('Unión 8').mergedIntoId).toBeNull();

    const merged = (await merge('Unión 7', ['Unión 8'], { separateAccounts: true }).expect(201))
      .body as TableDto;
    expect(merged.activeOrders.map((summary) => summary.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('respeta permisos: otro mesero no une cuentas ajenas y cocina no opera mesas', async () => {
    await refresh();
    const foreign = await openEmpty('Unión 9', 2, andres);
    await merge('Unión 1', ['Unión 9']).expect(403);
    await kitchen
      .post(`/tables/${table('Unión 1').id}/merge`, { tableIds: [table('Unión 9').id] })
      .expect(403);
    await andres
      .post(`/orders/${foreign.id}/close-empty`, { version: foreign.version })
      .expect(201);
  });

  it('separar mesas: solo las indicadas, sin perder productos', async () => {
    await refresh();
    await laura
      .post(`/tables/${table('Unión 7').id}/unmerge`, { tableIds: [table('Unión 2').id] })
      .expect(409);
    const separated = (
      await laura
        .post(`/tables/${table('Unión 1').id}/unmerge`, { tableIds: [table('Unión 2').id] })
        .expect(201)
    ).body as TableDto;
    expect(separated.activeOrders).toHaveLength(1);
    const kept = await order(separated.activeOrders[0]?.id ?? '');
    expect(kept.items).toHaveLength(1);
    await refresh();
    expect(table('Unión 2')).toMatchObject({ mergedIntoId: null, status: 'FREE' });

    const all = (await laura.post(`/tables/${table('Unión 7').id}/unmerge`).expect(201))
      .body as TableDto;
    expect(all.activeOrders).toHaveLength(2);
  });

  it('cerrar una mesa abierta sin consumo la libera; con productos hay que anular', async () => {
    const empty = await openEmpty('Unión 2', 2);
    const closed = (
      await laura.post(`/orders/${empty.id}/close-empty`, { version: empty.version }).expect(201)
    ).body as OrderDto;
    expect(closed.status).toBe('CANCELLED');
    await refresh();
    expect(table('Unión 2').status).toBe('FREE');

    const withOrder = (
      await laura.get(`/orders/${table('Unión 7').activeOrders[0]?.id ?? ''}`).expect(200)
    ).body as OrderDto;
    const blocked = await laura
      .post(`/orders/${withOrder.id}/close-empty`, { version: withOrder.version })
      .expect(409);
    expect(code(blocked)).toBe('ORDER_NOT_EMPTY');
  });
});
