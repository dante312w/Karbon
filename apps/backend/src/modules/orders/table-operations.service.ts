import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode, type TableDto, TableStatus } from '@karbon/types';
import { ACTIVE_ORDER_STATUSES, canManageAll } from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { MergeTablesDto } from '../floor/floor.dto.js';
import { FloorService } from '../floor/floor.service.js';
import { OrderStore } from './order-store.service.js';

const TABLE_WITH_ORDERS = {
  orders: {
    where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
    select: { id: true, waiterId: true },
  },
  mergedTables: { select: { id: true } },
} satisfies Prisma.DiningTableInclude;

/**
 * Unir y separar mesas con sus cuentas (ADR 0012). Vive en el módulo de pedidos porque mueve
 * pedidos y publica sus cambios; el módulo de salón solo conoce el plano.
 */
@Injectable()
export class TableOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly floor: FloorService,
    private readonly store: OrderStore,
    private readonly audit: AuditService,
  ) {}

  /**
   * Une mesas a una principal. Las cuentas abiertas de las mesas unidas pasan a la principal
   * como cuentas separadas, con todo lo suyo: productos, notas, mesero, comandas enviadas o ya
   * preparadas, pagos parciales y divisiones. Si una mesa unida tenía a su vez otras unidas,
   * todas quedan con la principal. Se exige poder operar cada cuenta que se mueve.
   */
  async merge(mainId: string, dto: MergeTablesDto, user: AuthenticatedUser): Promise<TableDto> {
    const childIds = dto.tableIds.filter((id) => id !== mainId);
    const { affected, movedOrderIds } = await this.prisma.$transaction(
      async (tx) => {
        const tables = await this.lockTables(tx, [mainId, ...childIds]);
        const main = tables.find((table) => table.id === mainId);
        if (!main) throw notFound('La mesa principal');
        if (main.mergedIntoId)
          throw conflict(ErrorCode.CONFLICT, 'La mesa principal ya está unida a otra');
        const children = tables.filter((table) => table.id !== mainId);
        if (children.length !== childIds.length) throw notFound('Alguna de las mesas');
        const elsewhere = children.filter(
          (child) => child.mergedIntoId !== null && child.mergedIntoId !== mainId,
        );
        if (elsewhere.length > 0) {
          throw conflict(ErrorCode.TABLE_OCCUPIED, 'Alguna mesa ya está unida a otra', {
            tableIds: elsewhere.map((child) => child.id),
          });
        }
        this.assertCanOperate(user, tables);

        const grandchildIds = children.flatMap((child) =>
          child.mergedTables.map((grandchild) => grandchild.id),
        );
        const moved = children.flatMap((child) => child.orders.map((order) => order.id));
        await tx.diningTable.updateMany({
          where: { id: { in: [...childIds, ...grandchildIds] } },
          data: { mergedIntoId: mainId },
        });
        if (moved.length > 0) {
          await tx.$executeRaw`SELECT 1 FROM orders WHERE id = ANY(${moved}::uuid[]) FOR UPDATE`;
          // La versión sube: una terminal con el pedido abierto recarga antes de modificarlo.
          await tx.order.updateMany({
            where: { id: { in: moved } },
            data: { tableId: mainId, version: { increment: 1 } },
          });
        }
        await this.floor.refreshStatuses(tx, [mainId]);
        await this.audit.log(
          {
            userId: user.id,
            action: 'table.merge',
            entity: 'table',
            entityId: mainId,
            metadata: { childIds, movedOrderIds: moved, orders: moved.length },
          },
          tx,
        );
        return { affected: [mainId, ...childIds, ...grandchildIds], movedOrderIds: moved };
      },
      { timeout: 15_000 },
    );

    for (const orderId of movedOrderIds) this.store.publishUpdated(await this.store.load(orderId));
    await this.floor.publishTables(affected);
    return this.floor.getTable(mainId);
  }

  /**
   * Separa las mesas unidas. Las cuentas se quedan en la principal (no se sabe qué consumo era
   * de qué mesa); el mesero puede moverlas después a una mesa libre.
   */
  async unmerge(mainId: string, user: AuthenticatedUser): Promise<TableDto> {
    const childIds = await this.prisma.$transaction(async (tx) => {
      const [main] = await this.lockTables(tx, [mainId]);
      if (!main) throw notFound('La mesa');
      this.assertCanOperate(user, [main]);
      const children = main.mergedTables.map((child) => child.id);
      if (children.length === 0) return [];
      await tx.diningTable.updateMany({
        where: { id: { in: children } },
        data: { mergedIntoId: null, status: TableStatus.FREE },
      });
      await this.floor.refreshStatuses(tx, [mainId]);
      await this.audit.log(
        {
          userId: user.id,
          action: 'table.unmerge',
          entity: 'table',
          entityId: mainId,
          metadata: { childIds: children },
        },
        tx,
      );
      return children;
    });
    await this.floor.publishTables([mainId, ...childIds]);
    return this.floor.getTable(mainId);
  }

  private async lockTables(tx: Tx, ids: readonly string[]) {
    await tx.$executeRaw`SELECT 1 FROM tables WHERE id = ANY(${[...ids]}::uuid[]) FOR UPDATE`;
    return tx.diningTable.findMany({
      where: { id: { in: [...ids] }, deletedAt: null, isActive: true },
      include: TABLE_WITH_ORDERS,
    });
  }

  private assertCanOperate(
    user: AuthenticatedUser,
    tables: readonly { name: string; orders: readonly { waiterId: string }[] }[],
  ): void {
    const foreign = tables.find(
      (table) =>
        !canManageAll(
          user,
          table.orders.map((order) => order.waiterId),
        ),
    );
    if (foreign) {
      throw new ForbiddenException(`${foreign.name} tiene cuentas de otro mesero`);
    }
  }
}
