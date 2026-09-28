import { Injectable } from '@nestjs/common';
import {
  type KitchenTicketDto,
  KitchenTicketStatus,
  SocketEvent,
  SocketRoom,
  userRoom,
} from '@karbon/types';
import { OPEN_TICKET_STATUSES } from '@karbon/utils';
import { notFound } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FloorService } from '../floor/floor.service.js';
import { EventsService } from '../realtime/events.service.js';
import { OrderStore } from './order-store.service.js';
import { assertTicketTransition, ticketTimestampField } from './order-rules.js';
import type { TicketQueryDto } from './orders.dto.js';
import { TICKET_INCLUDE, toTicketDtoWithOrder } from './orders.mapper.js';

/** Las comandas entregadas siguen visibles un rato para poder deshacer un toque accidental. */
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

  async updateStatus(ticketId: string, status: KitchenTicketStatus): Promise<KitchenTicketDto> {
    const { ticket, tableId, waiterId } = await this.prisma.$transaction(async (tx) => {
      const current = await tx.kitchenTicket.findUnique({
        where: { id: ticketId },
        include: { order: { select: { tableId: true, waiterId: true } } },
      });
      if (!current) throw notFound('La comanda');
      assertTicketTransition(current.status, status);
      const field = ticketTimestampField(status);
      const updated = await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: { status, ...(field ? { [field]: new Date() } : {}) },
        include: TICKET_INCLUDE,
      });
      await this.floor.refreshStatuses(tx, [current.order.tableId]);
      return { ticket: updated, tableId: current.order.tableId, waiterId: current.order.waiterId };
    });

    const dto = toTicketDtoWithOrder(ticket);
    this.store.publishUpdated(await this.store.load(ticket.orderId));
    await this.floor.publishTables([tableId]);
    if (status === KitchenTicketStatus.READY) {
      this.events.publish(SocketEvent.KITCHEN_READY, { ticket: dto, waiterId }, [
        userRoom(waiterId),
        SocketRoom.CASHIER,
      ]);
    }
    return dto;
  }
}
