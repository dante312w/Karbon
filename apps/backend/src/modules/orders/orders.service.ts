import { Injectable } from '@nestjs/common';
import {
  BusinessMode,
  ErrorCode,
  OrderItemStatus,
  type OrderDto,
  OrderStatus,
  OrderType,
  type Paginated,
  Permission,
  PaymentStatus,
  KitchenTicketStatus,
  type KitchenStation,
} from '@karbon/types';
import {
  ACTIVE_ORDER_STATUSES,
  allocate,
  effectiveStation,
  OPEN_TICKET_STATUSES,
} from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, invalid, notFound } from '../../common/errors/domain-error.js';
import { dateRange, pageArgs, paginated } from '../../common/http/pagination.js';
import { decimalToMinor, minorToDecimal } from '../../common/money.js';
import { Prisma, type Order } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { FloorService } from '../floor/floor.service.js';
import { LicenseService } from '../license/license.service.js';
import { DomainEventsService } from '../realtime/domain-events.service.js';
import { ConfigCatalogService } from '../settings/catalog-config.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { assertCanManageOrder, OrderStore, requirePermission } from './order-store.service.js';
import { assertOrderEditable, normalizeNotes } from './order-rules.js';
import { lineTotal } from './order-totals.js';
import type {
  AddItemsDto,
  CancelDto,
  CancelItemDto,
  CreateOrderDto,
  DuplicateOrderDto,
  MoveOrderDto,
  OrderItemInputDto,
  OrderQueryDto,
  ReorderItemsDto,
  SplitOrderDto,
  UpdateItemDto,
  UpdateOrderDto,
} from './orders.dto.js';
import { ORDER_INCLUDE, toOrderDto } from './orders.mapper.js';

interface MutationResult {
  /** Mesas afectadas además de la del pedido (mover, dividir). */
  tableIds?: (string | null)[];
  sentTicketIds?: string[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OrderStore,
    private readonly settings: SettingsService,
    private readonly config: ConfigCatalogService,
    private readonly floor: FloorService,
    private readonly domainEvents: DomainEventsService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
  ) {}

  // ─── Consultas ──────────────────────────────────────────────────────────────

  get(id: string): Promise<OrderDto> {
    return this.store.load(id);
  }

  async list(query: OrderQueryDto): Promise<Paginated<OrderDto>> {
    const statusFilter: Prisma.OrderWhereInput =
      query.status === 'ACTIVE'
        ? { status: { in: [...ACTIVE_ORDER_STATUSES] } }
        : query.status
          ? { status: query.status }
          : {};
    const where: Prisma.OrderWhereInput = {
      ...statusFilter,
      ...(query.tableId ? { tableId: query.tableId } : {}),
      ...(query.waiterId ? { waiterId: query.waiterId } : {}),
      ...dateRange('createdAt', query),
      ...(query.search
        ? Number.isInteger(Number(query.search))
          ? { number: Number(query.search) }
          : { label: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const currency = await this.settings.currency();
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(
      orders.map((order) => toOrderDto(order, currency)),
      total,
      query,
    );
  }

  // ─── Crear ──────────────────────────────────────────────────────────────────

  /**
   * Crea un pedido. Si el cliente envía su propio `id` (pedido creado sin conexión) y ya existe,
   * devuelve el existente: reenviar desde la cola offline nunca duplica.
   */
  async create(dto: CreateOrderDto, user: AuthenticatedUser): Promise<OrderDto> {
    if (dto.send) requirePermission(user, Permission.ORDERS_SEND);
    if (dto.id) {
      const existing = await this.prisma.order.findUnique({
        where: { id: dto.id },
        select: { id: true },
      });
      if (existing) return this.store.load(existing.id);
    }
    await this.license.assertOperational();
    const settings = await this.settings.get();
    const type = dto.type ?? OrderType.DINE_IN;
    if (type === OrderType.DINE_IN && !dto.tableId && !dto.label) {
      throw invalid(ErrorCode.TABLE_REQUIRED, 'Indica la mesa o un nombre para la cuenta');
    }

    let sentTicketIds: string[] = [];
    const order = await this.prisma.$transaction(
      async (tx) => {
        let tableId: string | null = null;
        if (dto.tableId) {
          const serving = await this.floor.resolveServingTable(tx, dto.tableId);
          await tx.$executeRaw`SELECT 1 FROM tables WHERE id = ${serving.id}::uuid FOR UPDATE`;
          const active = await this.floor.activeOrderIds(tx, serving.id);
          if (active.length > 0) {
            throw conflict(ErrorCode.TABLE_OCCUPIED, 'La mesa ya tiene un pedido activo', {
              orderIds: active,
            });
          }
          tableId = serving.id;
        }
        const created = await tx.order.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            type,
            tableId,
            waiterId: user.id,
            guests: dto.guests ?? null,
            label: dto.label?.trim() ?? null,
            notes: dto.notes ?? null,
            customerId: dto.customerId ?? null,
            tipPercent: type === OrderType.DINE_IN && settings.tipEnabled ? settings.tipPercent : 0,
          },
        });
        if (dto.items?.length) await this.addItemsTx(tx, created, dto.items);
        if (dto.send) sentTicketIds = await this.sendTx(tx, created.id, settings.businessMode);
        await this.store.recalculate(tx, created.id);
        await this.floor.refreshStatuses(tx, [tableId]);
        return created;
      },
      { timeout: 15_000 },
    );

    const dtoOut = await this.store.load(order.id);
    this.store.publishCreated(dtoOut);
    await this.floor.publishTables([order.tableId]);
    if (sentTicketIds.length > 0)
      this.domainEvents.emit('tickets.sent', { ticketIds: sentTicketIds });
    return dtoOut;
  }

  // ─── Ítems ──────────────────────────────────────────────────────────────────

  addItems(orderId: string, dto: AddItemsDto, user: AuthenticatedUser): Promise<OrderDto> {
    if (dto.send) requirePermission(user, Permission.ORDERS_SEND);
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      await this.addItemsTx(tx, order, dto.items);
      return dto.send
        ? { sentTicketIds: await this.sendTx(tx, orderId, await this.settings.businessMode()) }
        : {};
    });
  }

  updateItem(
    orderId: string,
    itemId: string,
    dto: UpdateItemDto,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    if (dto.discount !== undefined) requirePermission(user, Permission.ORDERS_DISCOUNT);
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const item = await this.findItem(tx, orderId, itemId);
      const changesContent = dto.quantity !== undefined || dto.notes !== undefined;
      if (changesContent && item.status !== OrderItemStatus.PENDING) {
        throw conflict(
          ErrorCode.ITEM_ALREADY_SENT,
          'El producto ya se envió; anúlalo y agrégalo de nuevo',
        );
      }
      const currency = await this.settings.currency();
      const quantity = dto.quantity ?? item.quantity;
      const discount =
        dto.discount === undefined ? item.discount : minorToDecimal(dto.discount, currency);
      const total = lineTotal(item.unitPrice, quantity, discount, currency);
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          quantity,
          discount,
          total,
          ...(dto.notes === undefined ? {} : { notes: normalizeNotes(dto.notes) }),
        },
      });
      if (dto.discount !== undefined) {
        await this.audit.log(
          {
            userId: user.id,
            action: 'order.discount',
            entity: 'order',
            entityId: orderId,
            metadata: { itemId, discount: dto.discount },
          },
          tx,
        );
      }
      return {};
    });
  }

  /** Quitar un ítem pendiente lo elimina; anular uno ya enviado exige permiso y motivo. */
  cancelItem(
    orderId: string,
    itemId: string,
    dto: CancelItemDto,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const item = await this.findItem(tx, orderId, itemId);
      if (item.status === OrderItemStatus.PENDING) {
        await tx.orderItem.delete({ where: { id: itemId } });
        return {};
      }
      requirePermission(user, Permission.ORDERS_CANCEL);
      if (!dto.reason) throw badRequest('Indica el motivo de la anulación');
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          status: OrderItemStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelledById: user.id,
        },
      });
      if (item.ticketId) {
        const remaining = await tx.orderItem.count({
          where: { ticketId: item.ticketId, status: { not: OrderItemStatus.CANCELLED } },
        });
        if (remaining === 0) {
          await tx.kitchenTicket.update({
            where: { id: item.ticketId },
            data: { status: KitchenTicketStatus.CANCELLED, cancelledAt: new Date() },
          });
        }
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'order.item_cancel',
          entity: 'order',
          entityId: orderId,
          metadata: {
            itemId,
            product: item.productName,
            quantity: item.quantity,
            reason: dto.reason,
          },
        },
        tx,
      );
      return {};
    });
  }

  duplicateItem(
    orderId: string,
    itemId: string,
    version: number,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.mutate(orderId, version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const item = await this.findItem(tx, orderId, itemId);
      await this.addItemsTx(
        tx,
        order,
        [{ productId: item.productId, quantity: item.quantity, notes: item.notes }],
        {
          mergePending: false,
        },
      );
      return {};
    });
  }

  reorderItems(orderId: string, dto: ReorderItemsDto, user: AuthenticatedUser): Promise<OrderDto> {
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const count = await tx.orderItem.count({ where: { orderId, id: { in: dto.itemIds } } });
      if (count !== dto.itemIds.length) throw notFound('Alguno de los productos del pedido');
      for (const [index, id] of dto.itemIds.entries()) {
        await tx.orderItem.update({ where: { id }, data: { sortOrder: index + 1 } });
      }
      return {};
    });
  }

  // ─── Flujo del pedido ───────────────────────────────────────────────────────

  send(orderId: string, version: number | undefined, user: AuthenticatedUser): Promise<OrderDto> {
    return this.mutate(orderId, version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const sentTicketIds = await this.sendTx(tx, orderId, await this.settings.businessMode());
      return { sentTicketIds };
    });
  }

  requestBill(
    orderId: string,
    version: number | undefined,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.mutate(orderId, version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const items = await tx.orderItem.count({
        where: { orderId, status: { not: OrderItemStatus.CANCELLED } },
      });
      if (items === 0) throw invalid(ErrorCode.ORDER_EMPTY, 'El pedido no tiene productos');
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.BILL_REQUESTED, billRequestedAt: new Date() },
      });
      return {};
    });
  }

  update(orderId: string, dto: UpdateOrderDto, user: AuthenticatedUser): Promise<OrderDto> {
    if (dto.tipPercent !== undefined) requirePermission(user, Permission.PAYMENTS_CREATE);
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...(dto.guests === undefined ? {} : { guests: dto.guests }),
          ...(dto.label === undefined ? {} : { label: dto.label?.trim() ?? null }),
          ...(dto.notes === undefined ? {} : { notes: dto.notes }),
          ...(dto.customerId === undefined ? {} : { customerId: dto.customerId }),
          ...(dto.tipPercent === undefined ? {} : { tipPercent: dto.tipPercent }),
        },
      });
      return {};
    });
  }

  move(orderId: string, dto: MoveOrderDto, user: AuthenticatedUser): Promise<OrderDto> {
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const target = await this.floor.resolveServingTable(tx, dto.tableId);
      if (target.id === order.tableId) return {};
      await tx.$executeRaw`SELECT 1 FROM tables WHERE id = ${target.id}::uuid FOR UPDATE`;
      const active = await this.floor.activeOrderIds(tx, target.id);
      if (active.length > 0) {
        throw conflict(ErrorCode.TABLE_OCCUPIED, 'La mesa destino tiene un pedido activo', {
          orderIds: active,
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { tableId: target.id } });
      await this.audit.log(
        {
          userId: user.id,
          action: 'order.move',
          entity: 'order',
          entityId: orderId,
          metadata: { from: order.tableId, to: target.id },
        },
        tx,
      );
      return { tableIds: [target.id] };
    });
  }

  /** Divide la cuenta por ítems: los elegidos pasan a un pedido nuevo en la misma mesa. */
  async split(orderId: string, dto: SplitOrderDto, user: AuthenticatedUser): Promise<OrderDto> {
    let newOrderId = '';
    await this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const paid = await tx.payment.count({ where: { orderId, status: PaymentStatus.COMPLETED } });
      if (paid > 0)
        throw conflict(
          ErrorCode.ORDER_HAS_PAYMENTS,
          'No se divide un pedido con pagos registrados',
        );

      const items = await tx.orderItem.findMany({
        where: { orderId, status: { not: OrderItemStatus.CANCELLED } },
      });
      const byId = new Map(items.map((item) => [item.id, item]));
      const moving = dto.items.map((line) => {
        const item = byId.get(line.itemId);
        if (!item) throw notFound('Alguno de los productos a dividir');
        if (line.quantity > item.quantity) {
          throw badRequest(`Solo hay ${item.quantity} de ${item.productName}`);
        }
        return { item, quantity: line.quantity };
      });
      const movingUnits = moving.reduce((sum, line) => sum + line.quantity, 0);
      const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
      if (movingUnits >= totalUnits) {
        throw badRequest('El pedido original debe conservar al menos un producto');
      }
      const currency = await this.settings.currency();

      const created = await tx.order.create({
        data: {
          type: order.type,
          tableId: order.tableId,
          waiterId: order.waiterId,
          splitFromId: order.id,
          label: order.label,
          tipPercent: order.tipPercent,
        },
      });
      newOrderId = created.id;
      for (const { item, quantity } of moving) {
        if (quantity === item.quantity) {
          await tx.orderItem.update({ where: { id: item.id }, data: { orderId: created.id } });
          continue;
        }
        // El descuento de la línea se reparte en proporción a las unidades de cada cuenta.
        const remaining = item.quantity - quantity;
        const [keptDiscount = 0, movedDiscount = 0] = allocate(
          decimalToMinor(item.discount, currency),
          [remaining, quantity],
        );
        const kept = minorToDecimal(keptDiscount, currency);
        const moved = minorToDecimal(movedDiscount, currency);
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            quantity: remaining,
            discount: kept,
            total: lineTotal(item.unitPrice, remaining, kept, currency),
          },
        });
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: item.productId,
            ticketId: item.ticketId,
            status: item.status,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity,
            taxRate: item.taxRate,
            unitCost: item.unitCost,
            discount: moved,
            total: lineTotal(item.unitPrice, quantity, moved, currency),
            notes: item.notes,
            sortOrder: item.sortOrder,
          },
        });
      }
      await this.store.recalculate(tx, created.id);
      await this.audit.log(
        {
          userId: user.id,
          action: 'order.split',
          entity: 'order',
          entityId: orderId,
          metadata: { newOrderId: created.id },
        },
        tx,
      );
      return {};
    });
    const created = await this.store.load(newOrderId);
    this.store.publishCreated(created);
    return created;
  }

  async duplicate(
    orderId: string,
    dto: DuplicateOrderDto,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    const source = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { where: { status: { not: OrderItemStatus.CANCELLED } } } },
    });
    if (!source) throw notFound('El pedido');
    const tableId = dto.tableId === undefined ? null : dto.tableId;
    return this.create(
      {
        type: tableId || dto.label ? OrderType.DINE_IN : OrderType.TAKEAWAY,
        tableId,
        label: dto.label ?? (tableId ? null : `Copia #${source.number}`),
        items: source.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
        })),
      },
      user,
    );
  }

  cancel(orderId: string, dto: CancelDto, user: AuthenticatedUser): Promise<OrderDto> {
    return this.mutate(orderId, dto.version, user, async (tx, order) => {
      assertOrderEditable(order.status);
      const paid = await tx.payment.count({ where: { orderId, status: PaymentStatus.COMPLETED } });
      if (paid > 0)
        throw conflict(ErrorCode.ORDER_HAS_PAYMENTS, 'Anula primero los pagos del pedido');
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelledById: user.id,
        },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId, status: { in: [...OPEN_TICKET_STATUSES] } },
        data: { status: KitchenTicketStatus.CANCELLED, cancelledAt: new Date() },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'order.cancel',
          entity: 'order',
          entityId: orderId,
          metadata: { reason: dto.reason },
        },
        tx,
      );
      return {};
    });
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  /**
   * Envoltura común: bloqueo con versión → propiedad del pedido → cambio → totales → estado de
   * mesa → eventos. Ninguna modificación se salta la regla de que cada mesero opera lo suyo.
   */
  private async mutate(
    orderId: string,
    version: number | undefined,
    user: AuthenticatedUser,
    change: (tx: Tx, order: Order) => Promise<MutationResult>,
  ): Promise<OrderDto> {
    const { order, result } = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.store.lock(tx, orderId, version);
        assertCanManageOrder(user, locked.waiterId);
        const outcome = await change(tx, locked);
        await this.store.recalculate(tx, orderId);
        await this.floor.refreshStatuses(tx, [locked.tableId, ...(outcome.tableIds ?? [])]);
        return { order: locked, result: outcome };
      },
      { timeout: 15_000 },
    );
    const dto = await this.store.load(orderId);
    this.store.publishUpdated(dto);
    await this.floor.publishTables([order.tableId, dto.tableId, ...(result.tableIds ?? [])]);
    if (result.sentTicketIds?.length)
      this.domainEvents.emit('tickets.sent', { ticketIds: result.sentTicketIds });
    return dto;
  }

  private async findItem(tx: Tx, orderId: string, itemId: string) {
    const item = await tx.orderItem.findFirst({
      where: { id: itemId, orderId, status: { not: OrderItemStatus.CANCELLED } },
    });
    if (!item) throw notFound('El producto del pedido');
    return item;
  }

  /**
   * Agrega productos congelando nombre, precio, tarifa y costo. Por defecto suma cantidades a
   * un ítem pendiente idéntico (mismo producto y notas) para no llenar el ticket de líneas.
   */
  private async addItemsTx(
    tx: Tx,
    order: Order,
    inputs: readonly Pick<OrderItemInputDto, 'productId' | 'quantity' | 'notes'>[],
    options: { mergePending: boolean } = { mergePending: true },
  ): Promise<void> {
    const productIds = [...new Set(inputs.map((input) => input.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      include: { tax: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const unavailable = productIds.filter((id) => {
      const product = byId.get(id);
      return !product || !product.isActive || !product.isAvailable;
    });
    if (unavailable.length > 0) {
      throw conflict(ErrorCode.PRODUCT_UNAVAILABLE, 'Hay productos agotados o inactivos', {
        productIds: unavailable,
      });
    }

    const defaultRate = await this.config.defaultTaxRate(tx);
    const currency = await this.settings.currency();
    const pending = options.mergePending
      ? await tx.orderItem.findMany({
          where: { orderId: order.id, status: OrderItemStatus.PENDING },
        })
      : [];
    const maxSort = await tx.orderItem.aggregate({
      where: { orderId: order.id },
      _max: { sortOrder: true },
    });
    let sortOrder = maxSort._max.sortOrder ?? 0;

    for (const input of inputs) {
      const product = byId.get(input.productId);
      if (!product) continue;
      const notes = normalizeNotes(input.notes);
      const match = pending.find((item) => item.productId === product.id && item.notes === notes);
      if (match) {
        match.quantity += input.quantity;
        await tx.orderItem.update({
          where: { id: match.id },
          data: {
            quantity: match.quantity,
            total: lineTotal(match.unitPrice, match.quantity, match.discount, currency),
          },
        });
        continue;
      }
      sortOrder += 1;
      const created = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: input.quantity,
          taxRate: product.tax?.rate ?? defaultRate,
          unitCost: product.cost,
          total: lineTotal(product.price, input.quantity, new Prisma.Decimal(0), currency),
          notes,
          sortOrder,
        },
      });
      if (options.mergePending) pending.push(created);
    }

    if (order.status === OrderStatus.BILL_REQUESTED) {
      // Pedir algo más después de solicitar la cuenta reabre el pedido.
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.OPEN, billRequestedAt: null },
      });
    }
  }

  /** Crea una comanda por estación con los ítems pendientes (en modo bar, todo va a barra). */
  private async sendTx(tx: Tx, orderId: string, mode: BusinessMode): Promise<string[]> {
    const pending = await tx.orderItem.findMany({
      where: { orderId, status: OrderItemStatus.PENDING },
      include: { product: { select: { station: true, sendToKitchen: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    if (pending.length === 0)
      throw invalid(ErrorCode.ORDER_EMPTY, 'No hay productos pendientes por enviar');

    const direct = pending.filter((item) => !item.product.sendToKitchen).map((item) => item.id);
    if (direct.length > 0) {
      await tx.orderItem.updateMany({
        where: { id: { in: direct } },
        data: { status: OrderItemStatus.SENT },
      });
    }

    const byStation = new Map<KitchenStation, string[]>();
    for (const item of pending.filter((candidate) => candidate.product.sendToKitchen)) {
      const station = effectiveStation(item.product.station, mode);
      byStation.set(station, [...(byStation.get(station) ?? []), item.id]);
    }
    if (byStation.size === 0) return [];

    const last = await tx.kitchenTicket.aggregate({ where: { orderId }, _max: { sequence: true } });
    const sequence = (last._max.sequence ?? 0) + 1;
    const ticketIds: string[] = [];
    for (const [station, itemIds] of byStation) {
      const ticket = await tx.kitchenTicket.create({
        data: { orderId, sequence, station },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { status: OrderItemStatus.SENT, ticketId: ticket.id },
      });
      ticketIds.push(ticket.id);
    }
    return ticketIds;
  }
}
