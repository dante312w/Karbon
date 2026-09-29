import type {
  CashSessionSummaryDto,
  OrderDto,
  ProductDto,
  StaffCallDto,
  TableDto,
} from '@karbon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  type ApiClient,
  EventProbe,
  type Harness,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/**
 * Llamados internos sobre PostgreSQL real: cocina y caja llaman al mesero, el mesero llama a
 * caja. Usa mesas que no tocan las demás pruebas y deja la caja como la encontró (cerrada).
 */
describe('Llamados internos (integración)', () => {
  let harness: Harness;
  let laura: ApiClient;
  let andres: ApiClient;
  let cashier: ApiClient;
  let kitchen: ApiClient;
  let lauraProbe: EventProbe;
  let andresProbe: EventProbe;
  let cashierProbe: EventProbe;
  let kitchenProbe: EventProbe;
  let order: OrderDto;
  let tables: TableDto[];

  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Mesa ${name} no está en el seed`);
    return found;
  };
  const openCalls = async (client: ApiClient): Promise<StaffCallDto[]> =>
    (await client.get('/staff-calls').expect(200)).body as StaffCallDto[];
  const callWaiterFromKitchen = async (): Promise<StaffCallDto> =>
    (
      await kitchen
        .post('/staff-calls', { target: 'WAITER', reason: 'COME_OVER', orderId: order.id })
        .expect(201)
    ).body as StaffCallDto;

  beforeAll(async () => {
    harness = await startApp();
    laura = await loginWithPin(harness, 'Laura', '2222');
    andres = await loginWithPin(harness, 'Andrés', '3333');
    cashier = await loginWithPin(harness, 'Camila', '1111');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    lauraProbe = new EventProbe(harness, laura.session.accessToken);
    andresProbe = new EventProbe(harness, andres.session.accessToken);
    cashierProbe = new EventProbe(harness, cashier.session.accessToken);
    kitchenProbe = new EventProbe(harness, kitchen.session.accessToken);
    await Promise.all(
      [lauraProbe, andresProbe, cashierProbe, kitchenProbe].map((probe) => probe.connected()),
    );
    tables = (await laura.get('/tables').expect(200)).body as TableDto[];
    const products = (await laura.get('/products').expect(200)).body as ProductDto[];
    const soda = products.find((product) => product.name === 'Gaseosa 350 ml');
    if (!soda) throw new Error('Producto Gaseosa 350 ml no está en el seed');
    order = (
      await laura
        .post('/orders', {
          tableId: table('Terraza 1').id,
          items: [{ productId: soda.id, quantity: 2 }],
          send: true,
        })
        .expect(201)
    ).body as OrderDto;
  });

  afterAll(async () => {
    for (const probe of [lauraProbe, andresProbe, cashierProbe, kitchenProbe]) probe.close();
    await harness.close();
  });

  it('cocina llama al mesero del pedido: le suena a él y los demás lo ven dirigido', async () => {
    const call = await callWaiterFromKitchen();
    expect(call).toMatchObject({
      status: 'PENDING',
      table: { name: 'Terraza 1' },
      orderNumber: order.number,
      targetUser: { id: laura.session.user.id },
      createdBy: { name: 'Cocina' },
      callCount: 1,
    });
    const event = await lauraProbe.waitFor(
      'staff_call.created',
      (data) => data.call.id === call.id,
    );
    expect(event.alert).toBe(true);
    // Andrés recibe el evento (puede ayudar), pero el llamado es para Laura.
    const seen = await andresProbe.waitFor(
      'staff_call.created',
      (data) => data.call.id === call.id,
    );
    expect(seen.call.targetUser?.name).toBe(laura.session.user.name);
  });

  it('tocar de nuevo no duplica; pasado el tiempo entre avisos, insiste', async () => {
    const first = (await openCalls(kitchen)).find((call) => call.orderId === order.id);
    if (!first) throw new Error('Falta el llamado de cocina');
    const again = await callWaiterFromKitchen();
    expect(again).toMatchObject({ id: first.id, callCount: 1 });

    // Simula que pasó el tiempo mínimo entre avisos (evita que un doble toque suene dos veces).
    await harness.app.get(PrismaService).staffCall.update({
      where: { id: first.id },
      data: { lastCalledAt: new Date(Date.now() - 60_000) },
    });
    const insisted = await callWaiterFromKitchen();
    expect(insisted).toMatchObject({ id: first.id, callCount: 2 });
    const event = await lauraProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === first.id && data.call.callCount === 2,
    );
    expect(event.alert).toBe(true);
    expect((await openCalls(kitchen)).filter((call) => call.orderId === order.id)).toHaveLength(1);
  });

  it('cada quien llama a quien le corresponde, con motivos válidos', async () => {
    await laura.post('/staff-calls', { target: 'WAITER', reason: 'COME_OVER' }).expect(403);
    await kitchen.post('/staff-calls', { target: 'CASHIER', reason: 'ACCOUNT_HELP' }).expect(403);
    await cashier
      .post('/staff-calls', { target: 'WAITER', reason: 'CHARGE_TABLE', orderId: order.id })
      .expect(400);
    await cashier.post('/staff-calls', { target: 'WAITER', reason: 'TABLE_ATTENTION' }).expect(400);
    await cashier
      .post('/staff-calls', {
        target: 'WAITER',
        reason: 'TABLE_ATTENTION',
        orderId: order.id,
        tableId: table('Terraza 2').id,
      })
      .expect(400);
  });

  it('"Voy" lo toma un mesero; el otro ve quién va y quien llamó se entera', async () => {
    const call = (await openCalls(kitchen)).find((candidate) => candidate.orderId === order.id);
    if (!call) throw new Error('Falta el llamado de cocina');
    const taken = (await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(201))
      .body as StaffCallDto;
    expect(taken).toMatchObject({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: { name: 'Laura Gómez' },
    });
    await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(201);
    const conflict = await andres.post(`/staff-calls/${call.id}/acknowledge`).expect(409);
    expect((conflict.body as { message: string }).message).toContain('Laura');

    const answered = await kitchenProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.status === 'ACKNOWLEDGED',
    );
    expect(answered.alert).toBe(false);

    await andres.post(`/staff-calls/${call.id}/cancel`).expect(403);
    const resolved = (await laura.post(`/staff-calls/${call.id}/resolve`).expect(201))
      .body as StaffCallDto;
    expect(resolved).toMatchObject({ status: 'RESOLVED', closedBy: { name: 'Laura Gómez' } });
    await laura.post(`/staff-calls/${call.id}/resolve`).expect(409);
    expect((await openCalls(kitchen)).some((candidate) => candidate.id === call.id)).toBe(false);
  });

  it('caja llama al mesero desde la mesa: el servidor deduce quién la atiende', async () => {
    const call = (
      await cashier
        .post('/staff-calls', {
          target: 'WAITER',
          reason: 'TABLE_ATTENTION',
          tableId: table('Terraza 1').id,
          message: '  Piden la carta de postres ',
        })
        .expect(201)
    ).body as StaffCallDto;
    expect(call).toMatchObject({
      orderId: order.id,
      targetUser: { id: laura.session.user.id },
      message: 'Piden la carta de postres',
    });
    // Una mesa libre no tiene a quién dirigirlo: va a todos los meseros.
    const free = (
      await cashier
        .post('/staff-calls', {
          target: 'WAITER',
          reason: 'TABLE_ATTENTION',
          tableId: table('Terraza 2').id,
        })
        .expect(201)
    ).body as StaffCallDto;
    expect(free.targetUser).toBeNull();
    for (const id of [call.id, free.id]) {
      const cancelled = (await cashier.post(`/staff-calls/${id}/cancel`).expect(201))
        .body as StaffCallDto;
      expect(cancelled.status).toBe('CANCELLED');
    }
  });

  it('el mesero llama a caja para cobrar y el llamado se cierra solo al pagar', async () => {
    const call = (
      await laura
        .post('/staff-calls', { target: 'CASHIER', reason: 'CHARGE_TABLE', orderId: order.id })
        .expect(201)
    ).body as StaffCallDto;
    expect(call.targetUser).toBeNull();
    const event = await cashierProbe.waitFor(
      'staff_call.created',
      (data) => data.call.id === call.id,
    );
    expect(event.alert).toBe(true);
    // Otro mesero no atiende caja: no lo ve.
    expect((await openCalls(andres)).some((candidate) => candidate.id === call.id)).toBe(false);

    await cashier.post('/cash-sessions/open', { openingAmount: 0 }).expect(201);
    await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: order.total })
      .expect(201);
    const closed = await lauraProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.status === 'RESOLVED',
    );
    expect(closed.call.closedBy?.id).toBe(cashier.session.user.id);
    expect(closed.alert).toBe(false);
  });

  it('cerrar la caja cancela los llamados que quedaron abiertos', async () => {
    const call = (
      await laura.post('/staff-calls', { target: 'CASHIER', reason: 'ACCOUNT_HELP' }).expect(201)
    ).body as StaffCallDto;
    const current = (await cashier.get('/cash-sessions/current').expect(200))
      .body as CashSessionSummaryDto;
    await cashier
      .post(`/cash-sessions/${current.session.id}/close`, { countedCash: current.expectedCash })
      .expect(201);
    const cancelled = await lauraProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.status === 'CANCELLED',
    );
    expect(cancelled.call.closedBy).toBeNull();
    expect(await openCalls(laura)).toEqual([]);
  });
});
