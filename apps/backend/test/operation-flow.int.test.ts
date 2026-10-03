import type {
  AreaDto,
  AuditLogDto,
  CashSessionSummaryDto,
  DashboardDto,
  IngredientDto,
  InvoiceDto,
  KitchenTicketDto,
  LoginResponse,
  OrderDto,
  Paginated,
  PaymentResultDto,
  ProductDto,
  ReceiptDocument,
  TableDto,
} from '@karbon/types';
import request from 'supertest';
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
 * Recorre la operación completa de un turno sobre PostgreSQL real, con el catálogo demo:
 * mesero → cocina/barra → caja → inventario → facturación → cierre → reportes → modo bar.
 */
describe('Operación de un turno (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let waiter: ApiClient;
  let cashier: ApiClient;
  let kitchen: ApiClient;
  let kitchenProbe: EventProbe;
  let waiterProbe: EventProbe;
  let products: ProductDto[];
  let tables: TableDto[];
  let order: OrderDto;

  const product = (name: string): ProductDto => {
    const found = products.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Producto ${name} no está en el seed`);
    return found;
  };
  const table = (name: string): TableDto => {
    const found = tables.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Mesa ${name} no está en el seed`);
    return found;
  };
  const ingredient = async (name: string): Promise<IngredientDto> => {
    const response = await admin.get(`/ingredients?search=${encodeURIComponent(name)}`).expect(200);
    const found = (response.body as IngredientDto[]).find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Insumo ${name} no encontrado`);
    return found;
  };
  const refreshTables = async (): Promise<void> => {
    tables = (await waiter.get('/tables').expect(200)).body as TableDto[];
  };

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    waiter = await loginWithPin(harness, 'Laura', '2222');
    cashier = await loginWithPin(harness, 'Camila', '1111');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    kitchenProbe = new EventProbe(harness, kitchen.session.accessToken);
    waiterProbe = new EventProbe(harness, waiter.session.accessToken);
    await Promise.all([kitchenProbe.connected(), waiterProbe.connected()]);
    products = (await waiter.get('/products').expect(200)).body as ProductDto[];
    await refreshTables();
  });

  afterAll(async () => {
    kitchenProbe.close();
    waiterProbe.close();
    await harness.close();
  });

  describe('autenticación y permisos', () => {
    it('entrega permisos por rol y protege las rutas', async () => {
      expect(waiter.session.user.permissions).toContain('orders:create');
      expect(waiter.session.user.permissions).not.toContain('cash:open');
      await waiter.post('/cash-sessions/open', { openingAmount: 0 }).expect(403);
      await request(harness.app.getHttpServer()).get('/api/v1/orders').expect(401);
    });

    it('rota el refresh token y detecta su reutilización', async () => {
      const server = harness.app.getHttpServer();
      const original = admin.session.refreshToken;
      const rotated = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);
      const next = (rotated.body as LoginResponse).refreshToken;
      expect(next).not.toBe(original);

      // Reusar el token viejo revoca toda la familia: el nuevo tampoco sirve.
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(401);
      await request(server).post('/api/v1/auth/refresh').send({ refreshToken: next }).expect(401);
    });

    it('rechaza una socket sin token', async () => {
      const intruder = new EventProbe(harness, 'token-invalido');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(intruder.socket.connected).toBe(false);
      intruder.close();
    });
  });

  describe('pedido desde el celular del mesero', () => {
    it('crea el pedido con envío inmediato: una comanda por estación', async () => {
      const response = await waiter
        .post('/orders', {
          tableId: table('Mesa 2').id,
          guests: 2,
          items: [
            { productId: product('Hamburguesa clásica').id, quantity: 2, notes: 'sin cebolla' },
            { productId: product('Gaseosa 350 ml').id, quantity: 1 },
          ],
          send: true,
        })
        .expect(201);
      order = response.body as OrderDto;

      expect(order.items).toHaveLength(2);
      expect(order.tickets.map((ticket) => ticket.station).sort()).toEqual(['BAR', 'KITCHEN']);
      // Precios con impoconsumo incluido: 2 × 25.000 + 5.000 = 55.000; propina sugerida 10 % del
      // neto (5.092,59) redondeada a pesos enteros: en COP no se cobran centavos.
      expect(order.total - order.tipAmount).toBe(5_500_000);
      expect(order.tipAmount).toBe(509_300);

      const created = await kitchenProbe.waitFor(
        'order.created',
        (data) => data.order.id === order.id,
      );
      expect(created.order.tickets).toHaveLength(2);
      // Los meseros también lo reciben: su lista de pedidos se actualiza sin recargar.
      await waiterProbe.waitFor('order.created', (data) => data.order.id === order.id);
      await refreshTables();
      expect(table('Mesa 2').status).toBe('WAITING_FOOD');
      const summary = table('Mesa 2').activeOrders[0];
      expect(summary?.itemCount).toBe(3);
      expect(summary?.readyTickets).toBe(0);
      expect(summary?.preparingSince).toBe(
        [...order.tickets].map((ticket) => ticket.createdAt).sort()[0],
      );
    });

    it('no permite abrir un segundo pedido en una mesa ocupada', async () => {
      const response = await waiter.post('/orders', { tableId: table('Mesa 2').id }).expect(409);
      expect(response.body.code).toBe('TABLE_OCCUPIED');
    });

    it('agregar con la misma Idempotency-Key no duplica (cola offline)', async () => {
      const body = { items: [{ productId: product('Papas a la francesa').id, quantity: 1 }] };
      const headers = { 'Idempotency-Key': 'offline-add-papas-0001' };
      await waiter.post(`/orders/${order.id}/items`, body, headers).expect(201);
      const retry = await waiter.post(`/orders/${order.id}/items`, body, headers).expect(201);
      order = retry.body as OrderDto;
      const papas = order.items.filter((item) => item.productName === 'Papas a la francesa');
      expect(papas).toHaveLength(1);
      expect(papas[0]?.quantity).toBe(1);
    });

    it('detecta cambios concurrentes con la versión del pedido', async () => {
      const stale = order.version - 1;
      const response = await waiter
        .patch(`/orders/${order.id}`, { version: stale, guests: 3 })
        .expect(409);
      expect(response.body.code).toBe('ORDER_VERSION_CONFLICT');
    });

    it('envía la segunda ronda como una comanda nueva', async () => {
      const response = await waiter
        .post(`/orders/${order.id}/send`, { version: order.version })
        .expect(201);
      order = response.body as OrderDto;
      expect(order.tickets.filter((ticket) => ticket.sequence === 2)).toHaveLength(1);
      expect(order.items.every((item) => item.status === 'SENT')).toBe(true);
    });
  });

  describe('cocina (KDS) y entrega en la mesa', () => {
    let ticket: KitchenTicketDto;
    const deliverPath = (ticketId: string) => `/orders/${order.id}/tickets/${ticketId}/deliver`;

    it('avanza la comanda y avisa al mesero cuando está lista', async () => {
      const board = (await kitchen.get('/kitchen/tickets?station=KITCHEN').expect(200))
        .body as KitchenTicketDto[];
      const found = board.find(
        (candidate) => candidate.orderId === order.id && candidate.sequence === 1,
      );
      if (!found) throw new Error('Comanda no encontrada');
      ticket = found;
      expect(ticket.items[0]?.notes).toBe('sin cebolla');
      expect(ticket.waiterId).toBe(waiter.session.user.id);

      await kitchen
        .patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'PREPARING' })
        .expect(200);
      const ready = (
        await kitchen.patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'READY' }).expect(200)
      ).body as KitchenTicketDto;
      expect(ready.startedAt).not.toBeNull();
      expect(ready.readyAt).not.toBeNull();
      const event = await waiterProbe.waitFor(
        'kitchen.ready',
        (data) => data.ticket.id === ticket.id,
      );
      expect(event.ticket.tableName).toBe('Mesa 2');
      await refreshTables();
      expect(table('Mesa 2').activeOrders[0]?.readyTickets).toBe(1);
    });

    it('retroceder en cocina borra la marca del paso deshecho', async () => {
      const back = (
        await kitchen
          .patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'PREPARING' })
          .expect(200)
      ).body as KitchenTicketDto;
      expect(back.readyAt).toBeNull();
      expect(back.startedAt).not.toBeNull();
      await kitchen.patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'READY' }).expect(200);
    });

    it('cocina ya no entrega: la confirma el mesero', async () => {
      const response = await kitchen
        .patch(`/kitchen/tickets/${ticket.id}/status`, { status: 'DELIVERED' })
        .expect(409);
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
      await kitchen.post(deliverPath(ticket.id)).expect(403);
    });

    it('otro mesero no confirma entregas de un pedido ajeno', async () => {
      const andres = await loginWithPin(harness, 'Andrés', '3333');
      const response = await andres.post(deliverPath(ticket.id)).expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('el mesero confirma la entrega: queda quién y cuándo, y cocina se entera', async () => {
      const updated = (await waiter.post(deliverPath(ticket.id)).expect(201)).body as OrderDto;
      const delivered = updated.tickets.find((candidate) => candidate.id === ticket.id);
      expect(delivered?.status).toBe('DELIVERED');
      expect(delivered?.deliveredAt).not.toBeNull();
      expect(delivered?.deliveredBy?.id).toBe(waiter.session.user.id);
      await kitchenProbe.waitFor('kitchen.delivered', (data) => data.ticket.id === ticket.id);

      // Solo se entrega lo que está listo, y una sola vez.
      const again = await waiter.post(deliverPath(ticket.id)).expect(409);
      expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('deshacer la entrega vuelve a "Listo" y borra la marca', async () => {
      const undone = (
        await waiter.post(`/orders/${order.id}/tickets/${ticket.id}/undeliver`).expect(201)
      ).body as OrderDto;
      const back = undone.tickets.find((candidate) => candidate.id === ticket.id);
      expect(back?.status).toBe('READY');
      expect(back?.deliveredAt).toBeNull();
      expect(back?.deliveredBy).toBeNull();
    });

    it('una comanda de otro pedido no se entrega por esta ruta', async () => {
      const other = (
        await waiter
          .post('/orders', {
            label: 'Ruta cruzada',
            items: [{ productId: product('Gaseosa 350 ml').id, quantity: 1 }],
            send: true,
          })
          .expect(201)
      ).body as OrderDto;
      const foreign = other.tickets[0];
      if (!foreign) throw new Error('Sin comanda');
      await waiter.post(deliverPath(foreign.id)).expect(404);
      await admin
        .post(`/orders/${other.id}/cancel`, { version: other.version, reason: 'Prueba de ruta' })
        .expect(201);
    });

    it('con todo entregado la mesa pasa a ocupada', async () => {
      const current = (await waiter.get(`/orders/${order.id}`).expect(200)).body as OrderDto;
      for (const pending of current.tickets) {
        if (pending.status === 'NEW')
          await kitchen
            .patch(`/kitchen/tickets/${pending.id}/status`, { status: 'READY' })
            .expect(200);
        if (pending.status !== 'DELIVERED') await waiter.post(deliverPath(pending.id)).expect(201);
      }
      await refreshTables();
      expect(table('Mesa 2').status).toBe('OCCUPIED');
    });

    it('cocina no puede crear pedidos ni ver caja', async () => {
      await kitchen.post('/orders', { label: 'x' }).expect(403);
      await kitchen.get('/cash-sessions/current').expect(403);
    });
  });

  describe('caja, pago mixto e inventario por receta', () => {
    let carneBefore: number;

    it('pedir la cuenta marca la mesa y exige caja abierta para cobrar', async () => {
      order = (await waiter.post(`/orders/${order.id}/request-bill`, {}).expect(201))
        .body as OrderDto;
      expect(order.status).toBe('BILL_REQUESTED');
      await refreshTables();
      expect(table('Mesa 2').status).toBe('WAITING_BILL');

      const response = await cashier
        .post(`/orders/${order.id}/payments`, { method: 'CARD', amount: 1_000_000 })
        .expect(409);
      expect(response.body.code).toBe('CASH_SESSION_REQUIRED');
    });

    it('abre la caja una sola vez', async () => {
      await cashier.post('/cash-sessions/open', { openingAmount: 10_000_000 }).expect(201);
      const second = await cashier.post('/cash-sessions/open', { openingAmount: 0 }).expect(409);
      expect(second.body.code).toBe('CASH_SESSION_ALREADY_OPEN');
    });

    it('cobra con tarjeta y efectivo (pago mixto) y descuenta los insumos', async () => {
      carneBefore = (await ingredient('Carne de res molida')).stock;
      const card = await cashier
        .post(`/orders/${order.id}/payments`, {
          method: 'CARD',
          amount: 2_000_000,
          reference: 'VOUCHER-1',
        })
        .expect(201);
      expect((card.body as PaymentResultDto).completed).toBe(false);

      const pending = (card.body as PaymentResultDto).order.pendingAmount;
      await cashier
        .post(`/orders/${order.id}/payments`, {
          method: 'CASH',
          amount: pending + 1,
          tendered: pending + 1,
        })
        .expect(409);
      const cash = await cashier
        .post(
          `/orders/${order.id}/payments`,
          { method: 'CASH', amount: pending, tendered: pending + 1_000_000 },
          { 'Idempotency-Key': 'pago-efectivo-0001' },
        )
        .expect(201);
      const result = cash.body as PaymentResultDto;
      expect(result.completed).toBe(true);
      expect(result.change).toBe(1_000_000);
      expect(result.order.status).toBe('PAID');
      order = result.order;

      // 2 hamburguesas × 150 g de carne.
      expect((await ingredient('Carne de res molida')).stock).toBe(carneBefore - 300);
      await refreshTables();
      expect(table('Mesa 2').status).toBe('PAID');
    });

    it('emite el tiquete una sola vez con su desglose de impuestos', async () => {
      const first = (await cashier.post(`/orders/${order.id}/invoices`, {}).expect(201))
        .body as InvoiceDto;
      const again = (await cashier.post(`/orders/${order.id}/invoices`, {}).expect(201))
        .body as InvoiceDto;
      expect(again.id).toBe(first.id);
      expect(first.fullNumber).toMatch(/^T\d+$/);
      expect(first.taxBreakdown[0]?.rate).toBe(8);

      const document = (await cashier.get(`/invoices/${first.id}/document`).expect(200))
        .body as ReceiptDocument;
      expect(document.payments.map((payment) => payment.method)).toEqual(['CARD', 'CASH']);
      expect(document.total).toBe(order.total);
    });

    it('anular un pago reabre el pedido y devuelve el inventario', async () => {
      const payments = (await cashier.get(`/orders/${order.id}/payments`).expect(200)).body as {
        id: string;
        method: string;
      }[];
      const cashPayment = payments.find((payment) => payment.method === 'CASH');
      if (!cashPayment) throw new Error('Pago en efectivo no encontrado');
      await waiter
        .post(`/payments/${cashPayment.id}/void`, { reason: 'Error de cobro' })
        .expect(403);
      const voided = (
        await admin
          .post(`/payments/${cashPayment.id}/void`, { reason: 'Error de cobro' })
          .expect(201)
      ).body as PaymentResultDto;
      expect(voided.order.status).toBe('BILL_REQUESTED');
      expect((await ingredient('Carne de res molida')).stock).toBe(carneBefore);

      const repay = await cashier
        .post(`/orders/${order.id}/payments`, {
          method: 'TRANSFER',
          amount: voided.order.pendingAmount,
        })
        .expect(201);
      expect((repay.body as PaymentResultDto).completed).toBe(true);
      expect((await ingredient('Carne de res molida')).stock).toBe(carneBefore - 300);
    });

    it('libera la mesa después de pagar (el mesero también puede)', async () => {
      await kitchen.patch(`/tables/${table('Mesa 2').id}/status`, { status: 'FREE' }).expect(403);
      await waiter.patch(`/tables/${table('Mesa 2').id}/status`, { status: 'FREE' }).expect(200);
      await refreshTables();
      expect(table('Mesa 2').status).toBe('FREE');
    });
  });

  describe('operaciones de salón', () => {
    it('divide la cuenta por ítems en un pedido nuevo y reparte el descuento', async () => {
      const created = (
        await waiter
          .post('/orders', {
            tableId: table('Mesa 3').id,
            items: [
              { productId: product('Arroz con pollo').id, quantity: 2 },
              { productId: product('Limonada natural').id, quantity: 2 },
            ],
          })
          .expect(201)
      ).body as OrderDto;
      const rice = created.items.find((item) => item.productName === 'Arroz con pollo');
      if (!rice) throw new Error('Ítem no encontrado');
      const discounted = (
        await cashier
          .patch(`/orders/${created.id}/items/${rice.id}`, {
            version: created.version,
            discount: 400_000,
          })
          .expect(200)
      ).body as OrderDto;
      const split = (
        await waiter
          .post(`/orders/${created.id}/split`, {
            version: discounted.version,
            items: [{ itemId: rice.id, quantity: 1 }],
          })
          .expect(201)
      ).body as OrderDto;
      expect(split.splitFromId).toBe(created.id);
      expect(split.items[0]?.quantity).toBe(1);
      expect(split.items[0]?.discount).toBe(200_000);
      const original = (await waiter.get(`/orders/${created.id}`).expect(200)).body as OrderDto;
      expect(original.items.find((item) => item.id === rice.id)?.discount).toBe(200_000);
      expect(original.discountTotal + split.discountTotal).toBe(discounted.discountTotal);
      expect(original.total + split.total).toBe(discounted.total);
      await refreshTables();
      expect(table('Mesa 3').activeOrders).toHaveLength(2);
    });

    it('mueve un pedido a otra mesa libre', async () => {
      const created = (
        await waiter
          .post('/orders', {
            tableId: table('Mesa 4').id,
            items: [{ productId: product('Agua 600 ml').id, quantity: 1 }],
          })
          .expect(201)
      ).body as OrderDto;
      const moved = (
        await cashier
          .post(`/orders/${created.id}/move`, {
            version: created.version,
            tableId: table('Mesa 5').id,
          })
          .expect(201)
      ).body as OrderDto;
      expect(moved.tableName).toBe('Mesa 5');
      await refreshTables();
      expect(table('Mesa 4').status).toBe('FREE');
      expect(table('Mesa 5').status).toBe('OCCUPIED');
    });

    it('un producto agotado no se puede pedir', async () => {
      const brownie = product('Brownie con helado');
      await kitchen
        .patch(`/products/${brownie.id}/availability`, { isAvailable: false })
        .expect(200);
      const response = await waiter
        .post('/orders', { label: 'Para llevar', items: [{ productId: brownie.id, quantity: 1 }] })
        .expect(409);
      expect(response.body.code).toBe('PRODUCT_UNAVAILABLE');
      await kitchen
        .patch(`/products/${brownie.id}/availability`, { isAvailable: true })
        .expect(200);
    });

    it('al cobrar, lo que seguía "Listo" se da por entregado y queda en la bitácora', async () => {
      const created = (
        await waiter
          .post('/orders', {
            label: 'Para llevar Ana',
            type: 'TAKEAWAY',
            items: [
              { productId: product('Gaseosa 350 ml').id, quantity: 1 },
              { productId: product('Hamburguesa clásica').id, quantity: 1 },
            ],
            send: true,
          })
          .expect(201)
      ).body as OrderDto;
      const [drink, burger] = [...created.tickets].sort((a, b) =>
        a.station.localeCompare(b.station),
      );
      if (!drink || !burger) throw new Error('Se esperaban dos comandas');
      await kitchen.patch(`/kitchen/tickets/${drink.id}/status`, { status: 'READY' }).expect(200);

      const paid = (
        await cashier
          .post(`/orders/${created.id}/payments`, { method: 'CARD', amount: created.total })
          .expect(201)
      ).body as PaymentResultDto;
      const tickets = new Map(paid.order.tickets.map((ticket) => [ticket.id, ticket]));
      expect(tickets.get(drink.id)?.status).toBe('DELIVERED');
      expect(tickets.get(drink.id)?.deliveredBy).toBeNull();
      // Lo que aún se prepara (pagado por adelantado) sigue en cocina.
      expect(tickets.get(burger.id)?.status).toBe('NEW');

      const logs = (await admin.get('/audit-logs?search=order.auto_deliver').expect(200))
        .body as Paginated<AuditLogDto>;
      expect(logs.items.some((log) => log.entityId === created.id)).toBe(true);
    });
  });

  describe('mesas desde el celular: cada mesero opera lo suyo', () => {
    let andres: ApiClient;
    let own: OrderDto;
    let other: OrderDto;
    const openOrder = async (client: ApiClient, tableName: string, send = false) =>
      (
        await client
          .post('/orders', {
            tableId: table(tableName).id,
            guests: 2,
            items: [
              { productId: product('Hamburguesa clásica').id, quantity: 1, notes: 'bien asada' },
            ],
            send,
          })
          .expect(201)
      ).body as OrderDto;

    beforeAll(async () => {
      andres = await loginWithPin(harness, 'Andrés', '3333');
      await refreshTables();
      own = await openOrder(waiter, 'Mesa 6');
      other = await openOrder(andres, 'Terraza 3');
    });

    it('otro mesero no modifica, envía ni cobra un pedido ajeno', async () => {
      const add = { items: [{ productId: product('Agua 600 ml').id, quantity: 1 }] };
      await andres.post(`/orders/${own.id}/items`, add).expect(403);
      await andres.post(`/orders/${own.id}/send`, { version: own.version }).expect(403);
      await andres.post(`/orders/${own.id}/request-bill`, {}).expect(403);
      await andres.patch(`/orders/${own.id}`, { version: own.version, guests: 5 }).expect(403);
      const response = await andres
        .post(`/orders/${own.id}/move`, { version: own.version, tableId: table('Mesa 7').id })
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
      // Caja opera los pedidos de todos.
      own = (await cashier.post(`/orders/${own.id}/items`, add).expect(201)).body as OrderDto;
    });

    it('el mesero mueve su pedido a una mesa libre', async () => {
      own = (
        await waiter
          .post(`/orders/${own.id}/move`, { version: own.version, tableId: table('Mesa 7').id })
          .expect(201)
      ).body as OrderDto;
      expect(own.tableName).toBe('Mesa 7');
    });

    it('une una mesa ocupada: su cuenta pasa a la principal sin perder nada', async () => {
      const second = await openOrder(waiter, 'Mesa 8', true);
      const partial = (
        await cashier
          .post(`/orders/${second.id}/payments`, { method: 'CARD', amount: 1_000_000 })
          .expect(201)
      ).body as PaymentResultDto;

      // Las dos tienen consumo: quedarían cuentas separadas y hay que confirmarlo.
      const unconfirmed = await waiter
        .post(`/tables/${table('Mesa 7').id}/merge`, { tableIds: [table('Mesa 8').id] })
        .expect(409);
      expect(unconfirmed.body.code).toBe('TABLE_MERGE_NEEDS_CONFIRMATION');
      const merged = (
        await waiter
          .post(`/tables/${table('Mesa 7').id}/merge`, {
            tableIds: [table('Mesa 8').id],
            separateAccounts: true,
          })
          .expect(201)
      ).body as TableDto;
      expect(merged.activeOrders.map((summary) => summary.id).sort()).toEqual(
        [own.id, second.id].sort(),
      );

      const moved = (await waiter.get(`/orders/${second.id}`).expect(200)).body as OrderDto;
      expect(moved.tableName).toBe('Mesa 7');
      expect(moved.version).toBeGreaterThan(partial.order.version);
      expect(moved.waiter.id).toBe(waiter.session.user.id);
      expect(moved.paidAmount).toBe(1_000_000);
      expect(moved.items[0]?.notes).toBe('bien asada');
      expect(moved.tickets).toHaveLength(second.tickets.length);
      await refreshTables();
      expect(table('Mesa 8').mergedIntoId).toBe(table('Mesa 7').id);
      expect(table('Mesa 8').status).toBe(table('Mesa 7').status);
    });

    it('no une mesas con cuentas de otro mesero', async () => {
      const response = await waiter
        .post(`/tables/${table('Terraza 4').id}/merge`, { tableIds: [table('Terraza 3').id] })
        .expect(403);
      expect(response.body.message).toContain('Terraza 3');
      await andres.post(`/tables/${table('Mesa 7').id}/unmerge`).expect(403);
    });

    it('separar deja las cuentas en la principal y libera las demás', async () => {
      const separated = (await waiter.post(`/tables/${table('Mesa 7').id}/unmerge`).expect(201))
        .body as TableDto;
      expect(separated.activeOrders).toHaveLength(2);
      await refreshTables();
      expect(table('Mesa 8').mergedIntoId).toBeNull();
      expect(table('Mesa 8').status).toBe('FREE');
    });

    afterAll(async () => {
      for (const created of [own, other]) {
        const current = (await admin.get(`/orders/${created.id}`).expect(200)).body as OrderDto;
        await admin
          .post(`/orders/${created.id}/cancel`, {
            version: current.version,
            reason: 'Fin de prueba',
          })
          .expect(201);
      }
    });
  });

  describe('plano del salón', () => {
    it('el demo trae barra, cocina y entrada, y el administrador agrega elementos', async () => {
      const areas = (await waiter.get('/areas').expect(200)).body as AreaDto[];
      const salon = areas.find((area) => area.name === 'Salón');
      if (!salon) throw new Error('Área Salón no está en el seed');
      expect(salon.elements.map((element) => element.kind)).toEqual(
        expect.arrayContaining(['KITCHEN', 'ENTRANCE']),
      );

      await waiter.post(`/areas/${salon.id}/elements`, { kind: 'WALL' }).expect(403);
      const created = (
        await admin
          .post(`/areas/${salon.id}/elements`, { kind: 'WALL', label: '  ', posY: 6, width: 4 })
          .expect(201)
      ).body as AreaDto['elements'][number];
      expect(created.label).toBeNull();
      await admin.patch(`/floor-elements/${created.id}`, { posX: 2 }).expect(200);
      await admin.patch(`/floor-elements/${created.id}`, { width: 0 }).expect(400);
      const moved = ((await admin.get('/areas').expect(200)).body as AreaDto[])
        .flatMap((area) => area.elements)
        .find((element) => element.id === created.id);
      expect(moved).toMatchObject({ posX: 2, posY: 6, width: 4 });

      await admin.delete(`/floor-elements/${created.id}`).expect(204);
    });
  });

  describe('modo bar', () => {
    it('en modo bar todas las comandas van a la barra', async () => {
      await admin.patch('/settings', { businessMode: 'BAR' }).expect(200);
      const created = (
        await waiter
          .post('/orders', {
            label: 'Cuenta de Juan',
            items: [
              { productId: product('Hamburguesa clásica').id, quantity: 1 },
              { productId: product('Cerveza nacional').id, quantity: 2 },
            ],
            send: true,
          })
          .expect(201)
      ).body as OrderDto;
      expect(created.tableId).toBeNull();
      expect(created.tickets).toHaveLength(1);
      expect(created.tickets[0]?.station).toBe('BAR');
      expect(created.tickets[0]?.tableName).toBe('Cuenta de Juan');

      const roles = (await admin.get('/roles').expect(200)).body as {
        code: string;
        name: string;
        permissions: string[];
      }[];
      const bar = roles.find((role) => role.code === 'KITCHEN');
      expect(bar?.name).toBe('Barra');
      expect(bar?.permissions).toContain('orders:deliver');

      // El barman entrega lo que prepara aunque el pedido sea de otro mesero.
      const barman = await loginWithPin(harness, 'Cocina', '4444');
      const [barTicket] = created.tickets;
      if (!barTicket) throw new Error('Sin comanda');
      await barman
        .patch(`/kitchen/tickets/${barTicket.id}/status`, { status: 'READY' })
        .expect(200);
      await barman.post(`/orders/${created.id}/tickets/${barTicket.id}/deliver`).expect(201);

      await admin.patch('/settings', { businessMode: 'RESTAURANT' }).expect(200);
      const restored = ((await admin.get('/roles').expect(200)).body as typeof roles).find(
        (role) => role.code === 'KITCHEN',
      );
      expect(restored?.permissions).not.toContain('orders:deliver');
    });
  });

  describe('compras y costo promedio', () => {
    it('recibir una compra suma existencias y actualiza el costo promedio', async () => {
      const cheese = await ingredient('Queso cheddar');
      const suppliers = (await admin.get('/suppliers').expect(200)).body as { id: string }[];
      await admin
        .post('/purchases', {
          supplierId: suppliers[0]?.id,
          items: [{ ingredientId: cheese.id, quantity: 1_000, unitCost: 60 }],
          receive: true,
        })
        .expect(201);
      const after = await ingredient('Queso cheddar');
      expect(after.stock).toBe(cheese.stock + 1_000);
      expect(after.averageCost).toBeGreaterThan(cheese.averageCost);
      expect(after.lastCost).toBe(60);
    });

    it('un ajuste por conteo físico deja el stock exacto', async () => {
      const lettuce = await ingredient('Lechuga');
      await admin
        .post('/inventory/movements', {
          ingredientId: lettuce.id,
          type: 'ADJUSTMENT',
          quantity: 1_500,
          reason: 'Conteo',
        })
        .expect(201);
      expect((await ingredient('Lechuga')).stock).toBe(1_500);
    });
  });

  describe('cierre de caja y reportes', () => {
    it('cierra la caja con arqueo y diferencia', async () => {
      const current = (await cashier.get('/cash-sessions/current').expect(200))
        .body as CashSessionSummaryDto;
      expect(current.byMethod.map((row) => row.method).sort()).toEqual(['CARD', 'TRANSFER']);
      const closed = (
        await cashier
          .post(`/cash-sessions/${current.session.id}/close`, {
            countedCash: current.expectedCash - 500_000,
          })
          .expect(201)
      ).body as CashSessionSummaryDto;
      expect(closed.session.status).toBe('CLOSED');
      expect(closed.session.difference).toBe(-500_000);
    });

    it('el tablero de reportes refleja las ventas del día', async () => {
      const dashboard = (await admin.get('/reports/dashboard').expect(200)).body as DashboardDto;
      expect(dashboard.ordersCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.salesTotal).toBeGreaterThanOrEqual(order.total);
      expect(dashboard.topProducts.some((row) => row.name === 'Hamburguesa clásica')).toBe(true);
      expect(dashboard.salesByHour).toHaveLength(24);
      expect(dashboard.profit).toBeLessThan(dashboard.salesTotal);
      await waiter.get('/reports/dashboard').expect(403);
    });

    it('los pedidos pagados quedan en el historial paginado', async () => {
      const page = (await admin.get('/orders?status=PAID').expect(200)).body as Paginated<OrderDto>;
      expect(page.items.some((candidate) => candidate.id === order.id)).toBe(true);
      const future = new Date(Date.now() + 60_000).toISOString();
      const empty = (await admin.get(`/orders?status=PAID&from=${future}`).expect(200))
        .body as Paginated<OrderDto>;
      expect(empty.total).toBe(0);
    });
  });

  describe('auditoría', () => {
    it('registra quién anuló el pago y el cierre de caja', async () => {
      const voids = (await admin.get('/audit-logs?entity=payment').expect(200))
        .body as Paginated<AuditLogDto>;
      const voided = voids.items.find((entry) => entry.action === 'payment.void');
      expect(voided?.userName).toBe(admin.session.user.name);
      expect(voided?.metadata).toMatchObject({ reason: 'Error de cobro' });

      const closes = (await admin.get('/audit-logs?search=cash.close').expect(200))
        .body as Paginated<AuditLogDto>;
      expect(closes.items[0]?.userId).toBe(cashier.session.user.id);
    });

    it('solo quien tiene permiso de auditoría la consulta', async () => {
      await cashier.get('/audit-logs').expect(403);
    });
  });
});
