import type {
  CashSessionSummaryDto,
  OrderDto,
  ProductDto,
  StaffCallDto,
  StaffCallRecipientDto,
  TableDto,
} from '@karbon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StaffCallsService } from '../src/modules/staff-calls/staff-calls.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  type ApiClient,
  EventProbe,
  type Harness,
  loginWithPassword,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/** Margen para comprobar que un evento NO llegó a un equipo. */
const QUIET_MS = 400;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Llamados internos sobre PostgreSQL real: cocina y caja llaman a un mesero (o a todos), el mesero
 * llama a caja. Usa mesas que no tocan las demás pruebas y deja la caja como la encontró (cerrada).
 */
describe('Llamados internos (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
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
  /** Como el KDS: llama al mesero del pedido. */
  const callWaiterFromKitchen = async (): Promise<StaffCallDto> =>
    (
      await kitchen
        .post('/staff-calls', {
          target: 'WAITER',
          reason: 'COME_OVER',
          orderId: order.id,
          waiterId: laura.session.user.id,
        })
        .expect(201)
    ).body as StaffCallDto;

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
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
    await admin.patch('/settings', { staffCallEscalateSeconds: 0 });
    for (const probe of [lauraProbe, andresProbe, cashierProbe, kitchenProbe]) probe.close();
    await harness.close();
  });

  it('el selector ofrece a los meseros activos con su conexión, no a caja ni a cocina', async () => {
    const recipients = (await cashier.get('/staff-calls/recipients').expect(200))
      .body as StaffCallRecipientDto[];
    const names = recipients.map((recipient) => recipient.name);
    expect(names).toEqual(expect.arrayContaining(['Laura Gómez', 'Andrés Ruiz']));
    expect(names).not.toContain(cashier.session.user.name);
    expect(names).not.toContain(kitchen.session.user.name);
    expect(recipients.find((recipient) => recipient.id === laura.session.user.id)?.online).toBe(
      true,
    );
    // Solo quien puede llamar al mesero ve el selector.
    await laura.get('/staff-calls/recipients').expect(403);
  });

  it('llamar a un mesero en particular: solo a él le llega, los demás ni lo ven', async () => {
    const call = await callWaiterFromKitchen();
    expect(call).toMatchObject({
      status: 'PENDING',
      table: { name: 'Terraza 1' },
      orderNumber: order.number,
      targetUser: { id: laura.session.user.id },
      createdBy: { name: 'Cocina' },
      callCount: 1,
      seenAt: null,
      escalatedAt: null,
    });
    const event = await lauraProbe.waitFor(
      'staff_call.created',
      (data) => data.call.id === call.id,
    );
    expect(event.alert).toBe(true);
    await pause(QUIET_MS);
    expect(andresProbe.got('staff_call.created', (data) => data.call.id === call.id)).toBe(false);
    expect((await openCalls(andres)).some((candidate) => candidate.id === call.id)).toBe(false);
    expect((await openCalls(laura)).some((candidate) => candidate.id === call.id)).toBe(true);
  });

  it('"vista": el celular del mesero lo confirma y quien llamó lo ve', async () => {
    const call = (await openCalls(kitchen)).find((candidate) => candidate.orderId === order.id);
    if (!call) throw new Error('Falta el llamado de cocina');
    await andres.post(`/staff-calls/${call.id}/seen`).expect(403);
    const seen = (await laura.post(`/staff-calls/${call.id}/seen`).expect(201))
      .body as StaffCallDto;
    expect(seen.seenBy?.id).toBe(laura.session.user.id);
    const event = await kitchenProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.seenAt !== null,
    );
    expect(event.alert).toBe(false);
    // Volver a marcarla no cambia la hora ni vuelve a avisar.
    const again = (await laura.post(`/staff-calls/${call.id}/seen`).expect(201))
      .body as StaffCallDto;
    expect(again.seenAt).toBe(seen.seenAt);
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

  it('cada quien llama a quien le corresponde, con motivos y destinatarios válidos', async () => {
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
    // El destinatario debe ser un mesero activo; un llamado a caja no lleva mesero.
    await cashier
      .post('/staff-calls', {
        target: 'WAITER',
        reason: 'COME_OVER',
        waiterId: kitchen.session.user.id,
      })
      .expect(400);
    await cashier
      .post('/staff-calls', {
        target: 'WAITER',
        reason: 'COME_OVER',
        waiterId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404);
    await laura
      .post('/staff-calls', {
        target: 'CASHIER',
        reason: 'ACCOUNT_HELP',
        waiterId: andres.session.user.id,
      })
      .expect(400);
  });

  it('"Voy" y atendido solo los hace el mesero elegido; quien llamó se entera', async () => {
    const call = (await openCalls(kitchen)).find((candidate) => candidate.orderId === order.id);
    if (!call) throw new Error('Falta el llamado de cocina');
    await andres.post(`/staff-calls/${call.id}/acknowledge`).expect(403);
    const taken = (await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(201))
      .body as StaffCallDto;
    expect(taken).toMatchObject({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: { name: 'Laura Gómez' },
    });
    await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(201);

    const answered = await kitchenProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.status === 'ACKNOWLEDGED',
    );
    expect(answered.alert).toBe(false);

    await andres.post(`/staff-calls/${call.id}/cancel`).expect(403);
    await andres.post(`/staff-calls/${call.id}/resolve`).expect(403);
    const resolved = (await laura.post(`/staff-calls/${call.id}/resolve`).expect(201))
      .body as StaffCallDto;
    expect(resolved).toMatchObject({ status: 'RESOLVED', closedBy: { name: 'Laura Gómez' } });
    await laura.post(`/staff-calls/${call.id}/resolve`).expect(409);
    expect((await openCalls(kitchen)).some((candidate) => candidate.id === call.id)).toBe(false);

    // El registro queda: quién llamó, a quién, mesa, horas y estado.
    const row = await harness.app
      .get(PrismaService)
      .staffCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(row).toMatchObject({
      createdById: kitchen.session.user.id,
      targetUserId: laura.session.user.id,
      tableId: table('Terraza 1').id,
      status: 'RESOLVED',
    });
    expect(row.seenAt).not.toBeNull();
    expect(row.acknowledgedAt).not.toBeNull();
    expect(row.closedAt).not.toBeNull();
  });

  it('"Todos": sin mesero elegido le llega a todos y cualquiera lo toma', async () => {
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
      targetUser: null,
      message: 'Piden la carta de postres',
    });
    await lauraProbe.waitFor('staff_call.created', (data) => data.call.id === call.id);
    await andresProbe.waitFor('staff_call.created', (data) => data.call.id === call.id);
    await andres.post(`/staff-calls/${call.id}/acknowledge`).expect(201);
    const conflict = await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(409);
    expect((conflict.body as { message: string }).message).toContain('Andrés');
    const cancelled = (await cashier.post(`/staff-calls/${call.id}/cancel`).expect(201))
      .body as StaffCallDto;
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('mesero desconectado: el llamado lo espera y, sin respuesta, se escala a todos', async () => {
    andresProbe.close();
    await pause(QUIET_MS);
    const recipients = (await cashier.get('/staff-calls/recipients').expect(200))
      .body as StaffCallRecipientDto[];
    expect(recipients.find((recipient) => recipient.id === andres.session.user.id)?.online).toBe(
      false,
    );

    const call = (
      await cashier
        .post('/staff-calls', {
          target: 'WAITER',
          reason: 'COME_OVER',
          waiterId: andres.session.user.id,
        })
        .expect(201)
    ).body as StaffCallDto;
    // Al volver a conectarse, lo encuentra por REST (el socket solo avisa).
    expect((await openCalls(andres)).some((candidate) => candidate.id === call.id)).toBe(true);
    expect((await openCalls(laura)).some((candidate) => candidate.id === call.id)).toBe(false);

    const service = harness.app.get(StaffCallsService);
    const prisma = harness.app.get(PrismaService);
    await prisma.staffCall.update({
      where: { id: call.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    // Apagado (0) no escala nunca.
    expect(await service.escalateOverdue()).toBe(0);

    await admin.patch('/settings', { staffCallEscalateSeconds: 60 }).expect(200);
    await admin.patch('/settings', { staffCallEscalateSeconds: 601 }).expect(400);
    await service.escalateOverdue();
    const escalated = await lauraProbe.waitFor(
      'staff_call.updated',
      (data) => data.call.id === call.id && data.call.escalatedAt !== null,
    );
    expect(escalated.alert).toBe(true);
    // Se conserva a quién iba; ahora cualquiera lo atiende.
    expect(escalated.call.targetUser?.id).toBe(andres.session.user.id);
    expect((await openCalls(laura)).some((candidate) => candidate.id === call.id)).toBe(true);
    // Escalar es una sola vez.
    expect(await service.escalateOverdue()).toBe(0);
    await laura.post(`/staff-calls/${call.id}/acknowledge`).expect(201);
    await cashier.post(`/staff-calls/${call.id}/resolve`).expect(201);
    await admin.patch('/settings', { staffCallEscalateSeconds: 0 }).expect(200);
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
