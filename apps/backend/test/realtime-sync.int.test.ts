import type { AreaDto, OrderDto, ProductDto, StaffCallDto, TableDto } from '@karbon/types';
import { ticketTiming } from '@karbon/utils';
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
 * Sincronización en vivo de punta a punta: lo que hace un equipo lo ven los demás por Socket.io,
 * incluso después de reconectarse. Crea su propia área y mesas para no depender de las demás
 * pruebas.
 */
describe('Tiempo real entre equipos (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let laura: ApiClient;
  let cashier: ApiClient;
  let kitchen: ApiClient;
  let lauraProbe: EventProbe;
  let andresProbe: EventProbe;
  let cashierProbe: EventProbe;
  let kitchenProbe: EventProbe;
  let burger: ProductDto;
  let tables: TableDto[];
  let order: OrderDto;

  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Falta la mesa ${name}`);
    return found;
  };
  const latest = async (): Promise<OrderDto> =>
    (await laura.get(`/orders/${order.id}`).expect(200)).body as OrderDto;

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    laura = await loginWithPin(harness, 'Laura', '2222');
    const andres = await loginWithPin(harness, 'Andrés', '3333');
    cashier = await loginWithPin(harness, 'Camila', '1111');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    lauraProbe = new EventProbe(harness, laura.session.accessToken);
    andresProbe = new EventProbe(harness, andres.session.accessToken);
    cashierProbe = new EventProbe(harness, cashier.session.accessToken);
    kitchenProbe = new EventProbe(harness, kitchen.session.accessToken);
    await Promise.all(
      [lauraProbe, andresProbe, cashierProbe, kitchenProbe].map((probe) => probe.connected()),
    );

    const area = (await admin.post('/areas', { name: 'En vivo' }).expect(201)).body as AreaDto;
    for (const [index, name] of ['Vivo 1', 'Vivo 2', 'Vivo 3'].entries()) {
      await admin
        .post('/tables', { areaId: area.id, name, capacity: 4, posX: index * 3, posY: 0 })
        .expect(201);
    }
    tables = (await laura.get('/tables').expect(200)).body as TableDto[];
    const products = (await laura.get('/products').expect(200)).body as ProductDto[];
    const found = products.find((product) => product.name === 'Hamburguesa clásica');
    if (!found) throw new Error('Producto Hamburguesa clásica no está en el seed');
    burger = found;
  });

  afterAll(async () => {
    for (const probe of [lauraProbe, andresProbe, cashierProbe, kitchenProbe]) probe.close();
    await harness.close();
  });

  it('abrir mesa: caja recibe el pedido y los demás meseros ven la mesa ocupada', async () => {
    order = (
      await laura
        .post('/orders', {
          tableId: table('Vivo 1').id,
          guests: 2,
          items: [{ productId: burger.id, quantity: 1, notes: '  sin cebolla ' }],
        })
        .expect(201)
    ).body as OrderDto;
    expect(order.items[0]?.notes).toBe('sin cebolla');
    await cashierProbe.waitFor('order.created', (data) => data.order.id === order.id);
    const changed = await andresProbe.waitFor(
      'table.changed',
      (data) => data.table.id === table('Vivo 1').id && data.table.status !== 'FREE',
    );
    expect(changed.table.activeOrders[0]).toMatchObject({
      id: order.id,
      waiterName: laura.session.user.name,
    });
  });

  it('la nota de un producto sin enviar se edita y se ve al instante; enviado, ya no', async () => {
    const item = order.items[0];
    if (!item) throw new Error('Pedido sin productos');
    const edited = (
      await laura
        .patch(`/orders/${order.id}/items/${item.id}`, {
          version: order.version,
          notes: 'sin cebolla, extra queso',
        })
        .expect(200)
    ).body as OrderDto;
    await cashierProbe.waitFor(
      'order.updated',
      (data) =>
        data.order.id === order.id && data.order.items[0]?.notes === 'sin cebolla, extra queso',
    );

    const sent = (
      await laura.post(`/orders/${order.id}/send`, { version: edited.version }).expect(201)
    ).body as OrderDto;
    const ticket = sent.tickets[0];
    expect(ticket?.items[0]?.notes).toBe('sin cebolla, extra queso');
    const locked = await laura
      .patch(`/orders/${order.id}/items/${item.id}`, { version: sent.version, notes: 'otra' })
      .expect(409);
    expect((locked.body as { code: string }).code).toBe('ITEM_ALREADY_SENT');
  });

  it('listo le llega al mesero; al entregar, el cronómetro queda congelado', async () => {
    const ticket = (await latest()).tickets[0];
    if (!ticket) throw new Error('Pedido sin comanda');
    await kitchen
      .patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'PREPARING' })
      .expect(200);
    await kitchen.patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'READY' }).expect(200);
    const ready = await lauraProbe.waitFor('kitchen.ready', (data) => data.ticket.id === ticket.id);
    expect(ready.waiterId).toBe(laura.session.user.id);

    await laura.post(`/orders/${order.id}/tickets/${ticket.id}/deliver`).expect(201);
    const delivered = await kitchenProbe.waitFor(
      'kitchen.delivered',
      (data) => data.ticket.id === ticket.id && data.ticket.status === 'DELIVERED',
    );
    const now = ticketTiming(delivered.ticket, Date.now());
    const anHourLater = ticketTiming(delivered.ticket, Date.now() + 3_600_000);
    expect(now.stopped).toBe(true);
    expect(anHourLater.totalMs).toBe(now.totalMs);
    expect(delivered.ticket.deliveredBy?.id).toBe(laura.session.user.id);
  });

  it('mover y unir mesas: cada equipo ve el cambio de las dos mesas', async () => {
    const current = await latest();
    await laura
      .post(`/orders/${order.id}/move`, { version: current.version, tableId: table('Vivo 2').id })
      .expect(201);
    await andresProbe.waitFor(
      'table.changed',
      (data) => data.table.id === table('Vivo 1').id && data.table.status === 'FREE',
    );
    await andresProbe.waitFor(
      'table.changed',
      (data) =>
        data.table.id === table('Vivo 2').id &&
        data.table.activeOrders.some((summary) => summary.id === order.id),
    );

    await laura
      .post(`/tables/${table('Vivo 2').id}/merge`, { tableIds: [table('Vivo 3').id] })
      .expect(201);
    await cashierProbe.waitFor(
      'table.changed',
      (data) =>
        data.table.id === table('Vivo 3').id && data.table.mergedIntoId === table('Vivo 2').id,
    );
  });

  it('el descuento que aplica caja le llega al celular del mesero', async () => {
    const current = await latest();
    await cashier
      .put(`/orders/${order.id}/discount`, {
        version: current.version,
        discount: { type: 'PERCENT', value: 5, reason: 'Cortesía' },
      })
      .expect(200);
    const updated = await lauraProbe.waitFor(
      'order.updated',
      (data) => data.order.id === order.id && data.order.orderDiscount?.value === 5,
    );
    expect(updated.order.total).toBeLessThan(current.total);
  });

  it('un socket que se reconecta vuelve a sus salas y sigue recibiendo avisos', async () => {
    lauraProbe.socket.disconnect();
    expect(lauraProbe.socket.connected).toBe(false);
    lauraProbe.socket.connect();
    await lauraProbe.connected();

    const call = (
      await kitchen
        .post('/staff-calls', { target: 'WAITER', reason: 'COME_OVER', orderId: order.id })
        .expect(201)
    ).body as StaffCallDto;
    const received = await lauraProbe.waitFor(
      'staff_call.created',
      (data) => data.call.id === call.id,
    );
    expect(received.alert).toBe(true);
    await kitchen.post(`/staff-calls/${call.id}/cancel`).expect(201);
  });
});
