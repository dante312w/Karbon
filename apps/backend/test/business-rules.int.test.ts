import type {
  AreaDto,
  CashSessionSummaryDto,
  CategoryDto,
  OrderDto,
  ProductDto,
  TableDto,
} from '@karbon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiClient,
  type Harness,
  loginWithPassword,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/**
 * Reglas de negocio que protegen la operación: saldo nunca negativo, mesas unidas que se liberan,
 * nada se cobra sin enviarse, divisiones exactas y errores claros. Crea su propia área y mesas y
 * deja la caja como la encontró (cerrada).
 */
describe('Reglas de negocio de pedidos, cobro y salón (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let laura: ApiClient;
  let cashier: ApiClient;
  let tables: TableDto[];
  let burger: ProductDto;
  let direct: ProductDto;

  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Falta la mesa ${name}`);
    return found;
  };
  const refresh = async (): Promise<void> => {
    tables = (await laura.get('/tables').expect(200)).body as TableDto[];
  };
  const code = (response: { body: unknown }): string => (response.body as { code: string }).code;
  const open = async (tableName: string, items: object[], send = true): Promise<OrderDto> =>
    (await laura.post('/orders', { tableId: table(tableName).id, items, send }).expect(201))
      .body as OrderDto;
  const fresh = async (id: string): Promise<OrderDto> =>
    (await cashier.get(`/orders/${id}`).expect(200)).body as OrderDto;

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    laura = await loginWithPin(harness, 'Laura', '2222');
    cashier = await loginWithPin(harness, 'Camila', '1111');

    const area = (await admin.post('/areas', { name: 'Reglas' }).expect(201)).body as AreaDto;
    for (const [index, name] of ['Regla 1', 'Regla 2', 'Regla 3', 'Regla 4'].entries()) {
      await admin
        .post('/tables', { areaId: area.id, name, capacity: 4, posX: index * 3, posY: 0 })
        .expect(201);
    }
    await refresh();
    const products = (await laura.get('/products').expect(200)).body as ProductDto[];
    const found = products.find((product) => product.name === 'Hamburguesa clásica');
    if (!found) throw new Error('Producto Hamburguesa clásica no está en el seed');
    burger = found;
    const categories = (await admin.get('/categories').expect(200)).body as CategoryDto[];
    direct = (
      await admin
        .post('/products', {
          categoryId: categories[0]?.id,
          name: 'Agua de mostrador',
          price: 300_000,
          sendToKitchen: false,
        })
        .expect(201)
    ).body as ProductDto;
    await cashier.post('/cash-sessions/open', { openingAmount: 0 }).expect(201);
  });

  afterAll(async () => {
    const current = (await cashier.get('/cash-sessions/current').expect(200))
      .body as CashSessionSummaryDto | null;
    if (current) {
      await cashier
        .post(`/cash-sessions/${current.session.id}/close`, { countedCash: current.expectedCash })
        .expect(201);
    }
    await harness.close();
  });

  it('con un pago parcial, anular o quitar productos no deja el saldo negativo', async () => {
    const order = await open('Regla 1', [{ productId: burger.id, quantity: 2 }]);
    await laura
      .post(`/orders/${order.id}/items`, {
        version: order.version,
        items: [{ productId: burger.id, quantity: 1 }],
      })
      .expect(201);
    let current = await fresh(order.id);
    // Paga casi todo: una hamburguesa y media.
    await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: current.total - 1_000_000 })
      .expect(409); // aún hay una hamburguesa sin enviar
    await laura.post(`/orders/${order.id}/send`, { version: current.version }).expect(201);
    current = await fresh(order.id);
    const paid = current.total - 1_000_000;
    await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: paid })
      .expect(201);
    current = await fresh(order.id);

    const sent = current.items.find((item) => item.quantity === 2);
    if (!sent) throw new Error('Falta la línea enviada');
    const blocked = await admin
      .post(`/orders/${order.id}/items/${sent.id}/cancel`, {
        version: current.version,
        reason: 'El cliente no la quiso',
      })
      .expect(409);
    expect(code(blocked)).toBe('ORDER_HAS_PAYMENTS');
    expect((await fresh(order.id)).total).toBe(current.total);

    // Lo que falta se cobra normal y el pedido cierra.
    const result = await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: current.pendingAmount })
      .expect(201);
    expect((result.body as { completed: boolean }).completed).toBe(true);
  });

  it('liberar la mesa principal deshace la unión: cada mesa queda libre por separado', async () => {
    const order = await open('Regla 2', [{ productId: burger.id, quantity: 1 }]);
    await laura
      .post(`/tables/${table('Regla 2').id}/merge`, { tableIds: [table('Regla 3').id] })
      .expect(201);
    // La unida no se libera ni reserva mientras la principal tenga cuentas.
    const occupied = await cashier
      .patch(`/tables/${table('Regla 3').id}/status`, { status: 'RESERVED' })
      .expect(409);
    expect(code(occupied)).toBe('TABLE_OCCUPIED');

    await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: order.total })
      .expect(201);
    await laura.patch(`/tables/${table('Regla 2').id}/status`, { status: 'FREE' }).expect(200);
    await refresh();
    expect(table('Regla 2')).toMatchObject({ status: 'FREE', mergedIntoId: null });
    expect(table('Regla 3')).toMatchObject({ status: 'FREE', mergedIntoId: null });
  });

  it('no se cobra ni se pide la cuenta con platos sin enviar; lo directo se cobra y queda servido', async () => {
    const order = await open(
      'Regla 4',
      [
        { productId: burger.id, quantity: 1 },
        { productId: direct.id, quantity: 1 },
      ],
      false,
    );
    const bill = await laura
      .post(`/orders/${order.id}/request-bill`, { version: order.version })
      .expect(409);
    expect(code(bill)).toBe('ORDER_HAS_UNSENT_ITEMS');
    const pay = await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: order.total })
      .expect(409);
    expect(code(pay)).toBe('ORDER_HAS_UNSENT_ITEMS');

    // Sin la hamburguesa, la bebida de mostrador se cobra aunque no se haya "enviado".
    const kitchenLine = order.items.find((item) => item.productId === burger.id);
    if (!kitchenLine) throw new Error('Falta la hamburguesa');
    await laura
      .post(`/orders/${order.id}/items/${kitchenLine.id}/cancel`, { version: order.version })
      .expect(201);
    const onlyDirect = await fresh(order.id);
    await cashier
      .post(`/orders/${order.id}/payments`, { method: 'CASH', amount: onlyDirect.total })
      .expect(201);
    const closed = await fresh(order.id);
    expect(closed.status).toBe('PAID');
    expect(closed.items.every((item) => item.status === 'SENT')).toBe(true);
  });

  it('dividir con la misma línea repetida no mueve más unidades de las que hay', async () => {
    const order = (
      await laura
        .post('/orders', {
          label: 'División',
          items: [
            { productId: burger.id, quantity: 3 },
            { productId: direct.id, quantity: 2 },
          ],
        })
        .expect(201)
    ).body as OrderDto;
    const line = order.items.find((item) => item.productId === burger.id);
    if (!line) throw new Error('Falta la línea');
    await laura
      .post(`/orders/${order.id}/split`, {
        version: order.version,
        items: [
          { itemId: line.id, quantity: 2 },
          { itemId: line.id, quantity: 2 },
        ],
      })
      .expect(400);
    const split = (
      await laura
        .post(`/orders/${order.id}/split`, {
          version: order.version,
          items: [
            { itemId: line.id, quantity: 1 },
            { itemId: line.id, quantity: 1 },
          ],
        })
        .expect(201)
    ).body as OrderDto;
    const original = await fresh(order.id);
    const units = (o: OrderDto): number =>
      o.items
        .filter((item) => item.productId === burger.id)
        .reduce((sum, i) => sum + i.quantity, 0);
    expect(units(split)).toBe(2);
    expect(units(original)).toBe(1);
  });

  it('bajar la cantidad con un descuento mayor que la línea da un error claro, no un 500', async () => {
    const order = (
      await laura
        .post('/orders', { label: 'Cantidad', items: [{ productId: burger.id, quantity: 2 }] })
        .expect(201)
    ).body as OrderDto;
    const line = order.items[0];
    if (!line) throw new Error('Falta la línea');
    const discounted = (
      await cashier
        .patch(`/orders/${order.id}/items/${line.id}`, {
          version: order.version,
          discount: 3_000_000,
        })
        .expect(200)
    ).body as OrderDto;
    const response = await cashier
      .patch(`/orders/${order.id}/items/${line.id}`, { version: discounted.version, quantity: 1 })
      .expect(400);
    expect((response.body as { message: string }).message).toContain('descuento');
    await cashier
      .patch(`/orders/${order.id}/items/${line.id}`, {
        version: discounted.version,
        discount: 6_000_000,
      })
      .expect(400);
  });

  it('un nombre de cuenta vacío queda sin nombre y un cliente inexistente responde 404', async () => {
    await laura.post('/orders', { label: '   ', items: [] }).expect(422);
    const order = (await laura.post('/orders', { type: 'TAKEAWAY', label: '   ' }).expect(201))
      .body as OrderDto;
    expect(order.label).toBeNull();
    await laura
      .post('/orders', {
        label: 'Cliente',
        customerId: '01900000-0000-7000-8000-000000000000',
      })
      .expect(404);
  });
});
