import { Injectable } from '@nestjs/common';
import {
  type AreaDto,
  ErrorCode,
  type FloorElementDto,
  SocketEvent,
  type TableDto,
  TableStatus,
} from '@karbon/types';
import { ACTIVE_ORDER_STATUSES } from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db, Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateAreaDto,
  CreateFloorElementDto,
  CreateTableDto,
  SetTableStatusDto,
  TableQueryDto,
  UpdateAreaDto,
  UpdateFloorElementDto,
  UpdateTableDto,
} from './floor.dto.js';
import {
  AREA_INCLUDE,
  TABLE_INCLUDE,
  toAreaDto,
  toFloorElementDto,
  toTableDto,
} from './floor.mapper.js';
import { deriveTableStatus } from './table-status.js';

/** Texto opcional del elemento: vacío equivale a usar el nombre del tipo. */
function cleanLabel(label: string | null | undefined): string | null {
  return label?.trim() ? label.trim() : null;
}

@Injectable()
export class FloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Áreas ──────────────────────────────────────────────────────────────────

  async listAreas(): Promise<AreaDto[]> {
    const areas = await this.prisma.area.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: AREA_INCLUDE,
    });
    return areas.map(toAreaDto);
  }

  async createArea(dto: CreateAreaDto): Promise<AreaDto> {
    return toAreaDto(await this.prisma.area.create({ data: dto, include: AREA_INCLUDE }));
  }

  async updateArea(id: string, dto: UpdateAreaDto): Promise<AreaDto> {
    return toAreaDto(
      await this.prisma.area.update({ where: { id }, data: dto, include: AREA_INCLUDE }),
    );
  }

  async deleteArea(id: string): Promise<void> {
    const tables = await this.prisma.diningTable.count({ where: { areaId: id, deletedAt: null } });
    if (tables > 0)
      throw conflict(ErrorCode.CONFLICT, 'El área tiene mesas; muévelas o elimínalas primero');
    await this.prisma.area.delete({ where: { id } });
  }

  // ─── Elementos del plano (barra, cocina, baños…) ───────────────────────────

  async createElement(areaId: string, dto: CreateFloorElementDto): Promise<FloorElementDto> {
    const area = await this.prisma.area.findUnique({ where: { id: areaId }, select: { id: true } });
    if (!area) throw notFound('El área');
    const element = await this.prisma.floorElement.create({
      data: { ...dto, label: cleanLabel(dto.label), areaId },
    });
    return toFloorElementDto(element);
  }

  async updateElement(id: string, dto: UpdateFloorElementDto): Promise<FloorElementDto> {
    const element = await this.prisma.floorElement.update({
      where: { id },
      data: { ...dto, ...(dto.label === undefined ? {} : { label: cleanLabel(dto.label) }) },
    });
    return toFloorElementDto(element);
  }

  async deleteElement(id: string): Promise<void> {
    await this.prisma.floorElement.delete({ where: { id } });
  }

  // ─── Mesas ──────────────────────────────────────────────────────────────────

  async listTables(query: TableQueryDto): Promise<TableDto[]> {
    const currency = await this.settings.currency();
    const tables = await this.prisma.diningTable.findMany({
      where: {
        deletedAt: null,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.areaId ? { areaId: query.areaId } : {}),
      },
      include: TABLE_INCLUDE,
      orderBy: [{ area: { sortOrder: 'asc' } }, { posY: 'asc' }, { posX: 'asc' }, { name: 'asc' }],
    });
    return tables.map((table) => toTableDto(table, currency));
  }

  async getTable(id: string): Promise<TableDto> {
    const table = await this.prisma.diningTable.findFirst({
      where: { id, deletedAt: null },
      include: TABLE_INCLUDE,
    });
    if (!table) throw notFound('La mesa');
    return toTableDto(table, await this.settings.currency());
  }

  async createTable(dto: CreateTableDto): Promise<TableDto> {
    const { id } = await this.prisma.diningTable.create({ data: dto });
    await this.publishTables([id]);
    return this.getTable(id);
  }

  async updateTable(id: string, dto: UpdateTableDto): Promise<TableDto> {
    await this.prisma.diningTable.update({ where: { id }, data: dto });
    await this.publishTables([id]);
    return this.getTable(id);
  }

  async deleteTable(id: string, user: AuthenticatedUser): Promise<void> {
    await this.assertWithoutActiveOrders(this.prisma, id);
    await this.prisma.diningTable.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'table.delete',
      entity: 'table',
      entityId: id,
    });
    // Las demás terminales la quitan del plano (llega inactiva).
    await this.publishTables([id]);
  }

  /**
   * Reserva manual o liberación de una mesa sin pedidos activos. Una mesa unida a otra depende
   * de la principal: no se libera ni reserva mientras la principal tenga cuentas. Al liberar la
   * principal, la unión se deshace: cada mesa vuelve a estar disponible por separado.
   */
  async setStatus(id: string, dto: SetTableStatusDto, user: AuthenticatedUser): Promise<TableDto> {
    const serving = await this.resolveServingTable(this.prisma, id);
    await this.assertWithoutActiveOrders(this.prisma, serving.id);
    const released = dto.status === TableStatus.FREE;
    const children = await this.prisma.diningTable.findMany({
      where: { mergedIntoId: id },
      select: { id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.diningTable.update({
        where: { id },
        data: { status: dto.status, ...(released ? { mergedIntoId: null } : {}) },
      });
      await tx.diningTable.updateMany({
        where: { mergedIntoId: id },
        data: { status: dto.status, ...(released ? { mergedIntoId: null } : {}) },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'table.status',
          entity: 'table',
          entityId: id,
          metadata: {
            status: dto.status,
            ...(released && children.length > 0
              ? { unmerged: children.map((child) => child.id) }
              : {}),
          },
        },
        tx,
      );
    });
    await this.publishTables([id, ...children.map((child) => child.id)]);
    return this.getTable(id);
  }

  // ─── Uso interno de otros módulos ───────────────────────────────────────────

  /** Mesa donde vive el pedido: si la mesa está unida, la principal. */
  async resolveServingTable(tx: Db, tableId: string): Promise<{ id: string; name: string }> {
    const table = await tx.diningTable.findFirst({
      where: { id: tableId, deletedAt: null, isActive: true },
      include: { mergedInto: { select: { id: true, name: true } } },
    });
    if (!table) throw notFound('La mesa');
    return table.mergedInto ?? { id: table.id, name: table.name };
  }

  async activeOrderIds(db: Db, tableId: string): Promise<string[]> {
    const orders = await db.order.findMany({
      where: { tableId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      select: { id: true },
    });
    return orders.map((order) => order.id);
  }

  /** Recalcula y persiste el estado de las mesas (y de las unidas a ellas). */
  async refreshStatuses(
    tx: Tx,
    tableIds: readonly (string | null | undefined)[],
    paidTableIds: readonly string[] = [],
  ): Promise<void> {
    const ids = [...new Set(tableIds.filter((id): id is string => typeof id === 'string'))];
    for (const id of ids) {
      const table = await tx.diningTable.findUnique({
        where: { id },
        include: {
          orders: {
            where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
            select: { status: true, tickets: { select: { status: true } } },
          },
        },
      });
      if (!table) continue;
      const base = paidTableIds.includes(id) ? TableStatus.PAID : table.status;
      const status = deriveTableStatus(base, table.orders);
      if (status !== table.status) {
        await tx.diningTable.update({ where: { id }, data: { status } });
      }
      await tx.diningTable.updateMany({
        where: { mergedIntoId: id, status: { not: status } },
        data: { status },
      });
    }
  }

  /** Emite `table.changed` con el estado actual (después de confirmar la transacción). */
  async publishTables(tableIds: readonly (string | null | undefined)[]): Promise<void> {
    const ids = [...new Set(tableIds.filter((id): id is string => typeof id === 'string'))];
    if (ids.length === 0) return;
    const currency = await this.settings.currency();
    const tables = await this.prisma.diningTable.findMany({
      where: { id: { in: ids } },
      include: TABLE_INCLUDE,
    });
    for (const table of tables) {
      this.events.publish(
        SocketEvent.TABLE_CHANGED,
        { table: toTableDto(table, currency) },
        EVENT_ROOMS.tableChanged,
      );
    }
  }

  private async assertWithoutActiveOrders(db: Db, tableId: string): Promise<void> {
    const orders = await this.activeOrderIds(db, tableId);
    if (orders.length > 0) {
      throw conflict(ErrorCode.TABLE_OCCUPIED, 'La mesa tiene pedidos activos', {
        orderIds: orders,
      });
    }
  }
}
