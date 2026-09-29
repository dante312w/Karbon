import type {
  AuditLogDto,
  CashSessionSummaryDto,
  OrderDto,
  Paginated,
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
 * Descuento sobre el total en caja: porcentaje o valor fijo, con motivo, límite configurable y
 * auditoría. Usa mesas que no tocan las demás pruebas y deja caja y configuración como estaban.
 */
describe('Descuentos en caja (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let waiter: ApiClient;
  let cashier: ApiClient;
  let burger: ProductDto;
  let tables: TableDto[];

  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Mesa ${name} no está en el seed`);
    return found;
  };
  /** Cuatro hamburguesas de $25.000 sin propina: $100.000 exactos, como el ejemplo del negocio. */
  const openOrder = async (tableName: string): Promise<OrderDto> => {
    const created = (
      await waiter
        .post('/orders', {
          tableId: table(tableName).id,
          items: [{ productId: burger.id, quantity: 4 }],
          send: true,
        })
        .expect(201)
    ).body as OrderDto;
    return (
      await cashier.patch(`/orders/${created.id}`, { version: created.version, tipPercent: 0 })
    ).body as OrderDto;
  };
  const discount = (order: OrderDto, body: object, client: ApiClient = cashier) =>
    client.put(`/orders/${order.id}/discount`, { version: order.version, ...body });

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    waiter = await loginWithPin(harness, 'Laura', '2222');
    cashier = await loginWithPin(harness, 'Camila', '1111');
    tables = (await waiter.get('/tables').expect(200)).body as TableDto[];
    const products = (await waiter.get('/products').expect(200)).body as ProductDto[];
    const found = products.find((product) => product.name === 'Hamburguesa clásica');
    if (!found) throw new Error('Producto Hamburguesa clásica no está en el seed');
    burger = found;
  });

  afterAll(async () => {
    await admin.patch('/settings', { maxDiscountPercent: 100 });
    await harness.close();
  });

  it('10 % sobre $100.000 deja $90.000, con motivo, quién y cuándo', async () => {
    const order = await openOrder('Mesa 1');
    expect(order.total).toBe(10_000_000);

    await discount(
      order,
      { discount: { type: 'PERCENT', value: 10, reason: 'Cortesía' } },
      waiter,
    ).expect(403);
    const discounted = (
      await discount(order, {
        discount: { type: 'PERCENT', value: 10, reason: ' Cortesía ' },
      }).expect(200)
    ).body as OrderDto;
    expect(discounted.total).toBe(9_000_000);
    expect(discounted.discountTotal).toBe(1_000_000);
    expect(discounted.orderDiscount).toMatchObject({
      type: 'PERCENT',
      value: 10,
      amount: 1_000_000,
      reason: 'Cortesía',
      appliedBy: { name: cashier.session.user.name },
    });

    const logs = (await admin.get('/audit-logs?search=order.discount').expect(200))
      .body as Paginated<AuditLogDto>;
    const entry = logs.items.find(
      (log) => log.entityId === order.id && log.action === 'order.discount',
    );
    expect(entry?.metadata).toMatchObject({
      scope: 'order',
      previousTotal: 10_000_000,
      discountAmount: 1_000_000,
      finalTotal: 9_000_000,
      reason: 'Cortesía',
    });

    // Quitarlo devuelve el total y queda auditado.
    const restored = (await discount(discounted, { discount: null }).expect(200)).body as OrderDto;
    expect(restored.total).toBe(10_000_000);
    expect(restored.orderDiscount).toBeNull();
    const removed = (await admin.get('/audit-logs?search=order.discount_removed').expect(200))
      .body as Paginated<AuditLogDto>;
    expect(removed.items.some((log) => log.entityId === order.id)).toBe(true);
  });

  it('valida el tipo, el valor, el motivo y la versión', async () => {
    const order = await openOrder('Mesa 6');
    const bad = [
      { discount: { type: 'PERCENT', value: 150, reason: 'Cortesía' } },
      { discount: { type: 'PERCENT', value: 10.555, reason: 'Cortesía' } },
      { discount: { type: 'AMOUNT', value: 10.5, reason: 'Cortesía' } },
      { discount: { type: 'OTRO', value: 10, reason: 'Cortesía' } },
      { discount: { type: 'PERCENT', value: 10, reason: '   a  ' } },
      {},
    ];
    for (const body of bad) await discount(order, body).expect(400);
    await cashier
      .put(`/orders/${order.id}/discount`, {
        version: order.version - 1,
        discount: { type: 'PERCENT', value: 5, reason: 'Cortesía' },
      })
      .expect(409);

    // Un valor fijo mayor que la cuenta la deja en cero, nunca negativa.
    const free = (
      await discount(order, {
        discount: { type: 'AMOUNT', value: 50_000_000, reason: 'Invitación' },
      }).expect(200)
    ).body as OrderDto;
    expect(free.total).toBe(0);
    expect(free.orderDiscount?.amount).toBe(10_000_000);
    await discount(free, { discount: null }).expect(200);
  });

  it('respeta el descuento máximo configurado, también en los descuentos por producto', async () => {
    await admin.patch('/settings', { maxDiscountPercent: 15 }).expect(200);
    const order = await openOrder('Barra 1');
    const over = await discount(order, {
      discount: { type: 'PERCENT', value: 20, reason: 'Cliente frecuente' },
    }).expect(422);
    expect((over.body as { code: string }).code).toBe('DISCOUNT_LIMIT_EXCEEDED');

    const within = (
      await discount(order, {
        discount: { type: 'PERCENT', value: 15, reason: 'Cliente frecuente' },
      }).expect(200)
    ).body as OrderDto;
    const item = within.items[0];
    if (!item) throw new Error('Pedido sin productos');
    // El 15 % ya está usado: cualquier descuento por producto adicional lo supera.
    await cashier
      .patch(`/orders/${order.id}/items/${item.id}`, { version: within.version, discount: 100_000 })
      .expect(422);
    await admin.patch('/settings', { maxDiscountPercent: 100 }).expect(200);
  });

  it('dividir: un porcentaje pasa a las dos cuentas; un valor fijo hay que quitarlo antes', async () => {
    const order = await openOrder('Barra 2');
    const item = order.items[0];
    if (!item) throw new Error('Pedido sin productos');
    const fixed = (
      await discount(order, {
        discount: { type: 'AMOUNT', value: 500_000, reason: 'Demora' },
      }).expect(200)
    ).body as OrderDto;
    await cashier
      .post(`/orders/${order.id}/split`, {
        version: fixed.version,
        items: [{ itemId: item.id, quantity: 1 }],
      })
      .expect(409);

    const percent = (
      await discount(fixed, { discount: { type: 'PERCENT', value: 10, reason: 'Demora' } }).expect(
        200,
      )
    ).body as OrderDto;
    const split = (
      await cashier
        .post(`/orders/${order.id}/split`, {
          version: percent.version,
          items: [{ itemId: item.id, quantity: 1 }],
        })
        .expect(201)
    ).body as OrderDto;
    expect(split.orderDiscount).toMatchObject({ type: 'PERCENT', value: 10, reason: 'Demora' });
    expect(split.total).toBe(2_250_000);
    const original = (await cashier.get(`/orders/${order.id}`).expect(200)).body as OrderDto;
    expect(original.total).toBe(6_750_000);
  });

  it('con pagos parciales, el descuento no puede dejar la cuenta por debajo de lo pagado', async () => {
    await cashier.post('/cash-sessions/open', { openingAmount: 0 }).expect(201);
    try {
      const order = await openOrder('Barra 3');
      await cashier
        .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: 9_500_000 })
        .expect(201);
      const paidPart = (await cashier.get(`/orders/${order.id}`).expect(200)).body as OrderDto;
      const blocked = await discount(paidPart, {
        discount: { type: 'PERCENT', value: 10, reason: 'Cortesía' },
      }).expect(409);
      expect((blocked.body as { code: string }).code).toBe('ORDER_HAS_PAYMENTS');

      const fine = (
        await discount(paidPart, {
          discount: { type: 'AMOUNT', value: 500_000, reason: 'Cortesía' },
        }).expect(200)
      ).body as OrderDto;
      expect(fine.pendingAmount).toBe(0);
      await cashier.post(`/orders/${order.id}/payments`, { method: 'CARD', amount: 0 }).expect(201);
    } finally {
      const current = (await cashier.get('/cash-sessions/current').expect(200))
        .body as CashSessionSummaryDto;
      await cashier
        .post(`/cash-sessions/${current.session.id}/close`, { countedCash: current.expectedCash })
        .expect(201);
    }
  });
});
