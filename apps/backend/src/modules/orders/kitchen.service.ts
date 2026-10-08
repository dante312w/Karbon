import { Injectable } from '@nestjs/common';
import {
  type KitchenTicketDto,
  KitchenTicketStatus,
  type OrderDto,
  SocketEvent,
  userRoom,
} from '@karbon/types';
import { OPEN_TICKET_STATUSES } from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { notFound } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FloorService } from '../floor/floor.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import { assertCanManageOrder, OrderStore } from './order-store.service.js';
import { assertTicketTransition, type TicketActor, ticketStatusChange } from './order-rules.js';
import type { TicketQueryDto } from './orders.dto.js';
import { TICKET_INCLUDE, toTicketDtoWithOrder } from './orders.mapper.js';

/** Las comandas entregadas siguen visibles un rato en el historial del KDS. */
const DELIVERED_VISIBLE_MS = 15 * 60 * 1000;

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OrderStore,
    private readonly floor: FloorService,
    private readonly events: EventsService,
  ) {}

  async list(query: TicketQueryDto): Promise<KitchenTicketDto[]> {
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        ...(query.station ? { station: query.station } : {}),
        OR: [
          { status: { in: [...OPEN_TICKET_STATUSES] } },
          ...(query.includeDelivered === false
            ? []
            : [
                {
                  status: KitchenTicketStatus.DELIVERED,
                  deliveredAt: { gte: new Date(Date.now() - DELIVERED_VISIBLE_MS) },
                },
              ]),
        ],
      },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return tickets.map(toTicketDtoWithOrder);
  }

  /** KDS: cocina/barra prepara la comanda (Nuevo → Preparando → Listo) o deshace su paso. */
  updateStatus(
    ticketId: string,
    status: KitchenTicketStatus,
    user: AuthenticatedUser,
  ): Promise<KitchenTicketDto> {
    return this.transition({ ticketId, to: status, actor: 'kitchen', user });
  }

  /** El mesero del pedido (o quien opera todos) confirma que la comanda llegó a la mesa. */
  async deliver(orderId: string, ticketId: string, user: AuthenticatedUser): Promise<OrderDto> {
    await this.transition({
      ticketId,
      orderId,
      to: KitchenTicketStatus.DELIVERED,
      actor: 'service',
      user,
    });
    return this.store.load(orderId);
  }

  /** Deshace una entrega confirmada por error: la comanda vuelve a "Listo". */
  async undoDelivery(
    orderId: string,
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<OrderDto> {
    await this.transition({
      ticketId,
      orderId,
      to: KitchenTicketStatus.READY,
      actor: 'service',
      user,
    });
    return this.store.load(orderId);
  }

  private async transition(params: {
    ticketId: string;
    /** Cuando la ruta nombra el pedido, la comanda debe pertenecerle. */
    orderId?: string;
    to: KitchenTicketStatus;
    actor: TicketActor;
    user: AuthenticatedUser;
  }): Promise<KitchenTicketDto> {
    const { ticketId, orderId, to, actor, user } = params;
    const { ticket, tableId, waiterId } = await this.prisma.$transaction(async (tx) => {
      // Dos terminales tocando la misma comanda: la segunda ve el estado ya cambiado.
      await tx.$executeRaw`SELECT 1 FROM kitchen_tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
      const current = await tx.kitchenTicket.findUnique({
        where: { id: ticketId },
        include: { order: { select: { tableId: true, waiterId: true } } },
      });
      if (!current || (orderId !== undefined && current.orderId !== orderId)) {
        throw notFound('La comanda');
      }
      if (actor === 'service') assertCanManageOrder(user, current.order.waiterId);
      assertTicketTransition(actor, current.status, to);
      const updated = await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: ticketStatusChange(current.status, to, new Date(), user.id),
        include: TICKET_INCLUDE,
      });
      await this.floor.refreshStatuses(tx, [current.order.tableId]);
      return { ticket: updated, tableId: current.order.tableId, waiterId: current.order.waiterId };
    });

    const dto = toTicketDtoWithOrder(ticket);
    this.store.publishUpdated(await this.store.load(ticket.orderId));
    await this.floor.publishTables([tableId]);
    if (actor === 'kitchen' && to === KitchenTicketStatus.READY) {
      this.events.publish(SocketEvent.KITCHEN_READY, { ticket: dto, waiterId }, [
        userRoom(waiterId),
        ...EVENT_ROOMS.kitchenReady,
      ]);
    }
    if (actor === 'service') {
      this.events.publish(SocketEvent.KITCHEN_DELIVERED, { ticket: dto, waiterId }, [
        userRoom(waiterId),
        ...EVENT_ROOMS.kitchenDelivered,
      ]);
    }
    return dto;
  }
}
