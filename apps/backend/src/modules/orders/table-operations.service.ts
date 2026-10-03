import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode, OrderStatus, type TableDto, TableStatus } from '@karbon/types';
import { ACTIVE_ORDER_STATUSES, canManageAll } from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { conflict, notFound } from '../../common/errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { MergeTablesDto, UnmergeTablesDto } from '../floor/floor.dto.js';
import { FloorService } from '../floor/floor.service.js';
import { OrderStore } from './order-store.service.js';

const TABLE_WITH_ORDERS = {
  orders: {
    where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
    select: {
      id: true,
      number: true,
      waiterId: true,
      guests: true,
      createdAt: true,
      _count: { select: { items: true, payments: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  mergedTables: { select: { id: true } },
} satisfies Prisma.DiningTableInclude;

type TableWithOrders = Prisma.DiningTableGetPayload<{ include: typeof TABLE_WITH_ORDERS }>;
type GroupOrder = TableWithOrders['orders'][number];

/** Cuenta abierta sin nada pedido ni pagado (la mesa se abrió y aún no se pidió). */
function isEmptyAccount(order: GroupOrder): boolean {
  return order._count.items === 0 && order._count.payments === 0;
}

/** Personas de la mesa unida: se suman (sin dato en ninguna, sigue sin dato). */
function sumGuests(orders: readonly GroupOrder[]): number | null {
  const known = orders.flatMap((order) => (order.guests === null ? [] : [order.guests]));
  return known.length === 0
    ? null
    : Math.min(
        200,
        known.reduce((sum, guests) => sum + guests, 0),
      );
}

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
   * Une mesas a una principal, tengan o no pedido: libres, abiertas sin consumo o con su cuenta.
   * El grupo queda con una sola cuenta compartida en la principal (lo que se pida después cae
   * ahí): las cuentas vacías se absorben y sus personas se suman. Si más de una mesa tiene
   * consumo, sus cuentas pasan a la principal como cuentas separadas, con todo lo suyo (productos,
   * comandas, pagos parciales), y eso hay que confirmarlo (`separateAccounts`). Se exige poder
   * operar cada cuenta del grupo.
   */
  async merge(mainId: string, dto: MergeTablesDto, user: AuthenticatedUser): Promise<TableDto> {
    const childIds = dto.tableIds.filter((id) => id !== mainId);
    const { affected, changedOrderIds } = await this.prisma.$transaction(
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

        const incoming = children.flatMap((child) => child.orders);
        const group = [...main.orders, ...incoming];
        const withConsumption = group.filter((order) => !isEmptyAccount(order));
        if (
          incoming.some((order) => !isEmptyAccount(order)) &&
          withConsumption.length > 1 &&
          dto.separateAccounts !== true
        ) {
          throw conflict(
            ErrorCode.TABLE_MERGE_NEEDS_CONFIRMATION,
            `Varias mesas ya tienen consumo: sus cuentas quedarán separadas dentro de ${main.name}`,
            { orders: withConsumption.map(({ id, number }) => ({ id, number })) },
          );
        }

        // La cuenta compartida: la primera con consumo (de la principal antes que de las demás);
        // si nadie ha pedido, la de la principal o la primera abierta.
        const shared = withConsumption[0] ?? group[0];
        const absorbed = group.filter((order) => order !== shared && isEmptyAccount(order));
        const moved = incoming
          .filter((order) => !absorbed.includes(order))
          .map((order) => order.id);

        const grandchildIds = children.flatMap((child) =>
          child.mergedTables.map((grandchild) => grandchild.id),
        );
        await tx.diningTable.updateMany({
          where: { id: { in: [...childIds, ...grandchildIds] } },
          data: { mergedIntoId: mainId },
        });
        const locked = group.map((order) => order.id);
        if (locked.length > 0) {
          await tx.$executeRaw`SELECT 1 FROM orders WHERE id = ANY(${locked}::uuid[]) FOR UPDATE`;
        }
        if (absorbed.length > 0) {
          await tx.order.updateMany({
            where: { id: { in: absorbed.map((order) => order.id) } },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledById: user.id,
              cancelReason: `Sin consumo: se unió a la cuenta de ${main.name}`,
              version: { increment: 1 },
            },
          });
        }
        if (moved.length > 0) {
          // La versión sube: una terminal con el pedido abierto recarga antes de modificarlo.
          await tx.order.updateMany({
            where: { id: { in: moved } },
            data: { tableId: mainId, version: { increment: 1 } },
          });
        }
        if (shared && absorbed.length > 0) {
          await tx.order.update({
            where: { id: shared.id },
            data: {
              tableId: mainId,
              guests: sumGuests([shared, ...absorbed]),
              version: { increment: 1 },
            },
          });
        }
        await this.floor.refreshStatuses(tx, [mainId]);
        await this.audit.log(
          {
            userId: user.id,
            action: 'table.merge',
            entity: 'table',
            entityId: mainId,
            metadata: {
              childIds,
              sharedOrderId: shared?.id ?? null,
              movedOrderIds: moved,
              absorbedOrderIds: absorbed.map((order) => order.id),
              separateAccounts: withConsumption.length > 1,
            },
          },
          tx,
        );
        return {
          affected: [mainId, ...childIds, ...grandchildIds],
          changedOrderIds: [
            ...new Set([
              ...moved,
              ...absorbed.map((order) => order.id),
              ...(shared ? [shared.id] : []),
            ]),
          ],
        };
      },
      { timeout: 15_000 },
    );

    for (const orderId of changedOrderIds) {
      this.store.publishUpdated(await this.store.load(orderId));
    }
    await this.floor.publishTables(affected);
    return this.floor.getTable(mainId);
  }

  /**
   * Separa las mesas unidas (todas o las indicadas). Las cuentas se quedan en la principal: no se
   * sabe qué consumo era de qué mesa, y así nunca se pierde un producto. El mesero puede moverlas
   * después a una de las mesas liberadas.
   */
  async unmerge(mainId: string, dto: UnmergeTablesDto, user: AuthenticatedUser): Promise<TableDto> {
    const childIds = await this.prisma.$transaction(async (tx) => {
      const [main] = await this.lockTables(tx, [mainId]);
      if (!main) throw notFound('La mesa');
      this.assertCanOperate(user, [main]);
      const joined = main.mergedTables.map((child) => child.id);
      const requested = dto.tableIds ?? joined;
      const foreign = requested.filter((id) => !joined.includes(id));
      if (foreign.length > 0) {
        throw conflict(ErrorCode.CONFLICT, `Alguna mesa no está unida a ${main.name}`, {
          tableIds: foreign,
        });
      }
      if (requested.length === 0) return [];
      await tx.diningTable.updateMany({
        where: { id: { in: requested } },
        data: { mergedIntoId: null, status: TableStatus.FREE },
      });
      await this.floor.refreshStatuses(tx, [mainId]);
      await this.audit.log(
        {
          userId: user.id,
          action: 'table.unmerge',
          entity: 'table',
          entityId: mainId,
          metadata: {
            childIds: requested,
            remainingIds: joined.filter((id) => !requested.includes(id)),
            orderIds: main.orders.map((order) => order.id),
          },
        },
        tx,
      );
      return requested;
    });
    await this.floor.publishTables([mainId, ...childIds]);
    return this.floor.getTable(mainId);
  }

  private async lockTables(tx: Tx, ids: readonly string[]): Promise<TableWithOrders[]> {
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
