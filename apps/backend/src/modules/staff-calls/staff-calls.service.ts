import { ForbiddenException, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  SocketEvent,
  type StaffCallDto,
  StaffCallReason,
  StaffCallStatus,
  StaffCallTarget,
  userRoom,
} from '@karbon/types';
import {
  ACTIVE_ORDER_STATUSES,
  canAnswerStaffCall,
  canCreateStaffCall,
  STAFF_CALL_INSIST_COOLDOWN_MS,
  STAFF_CALL_NEEDS_PLACE,
  STAFF_CALL_REASONS,
} from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, notFound } from '../../common/errors/domain-error.js';
import { Prisma, type StaffCall } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DomainEventsService } from '../realtime/domain-events.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import type { CreateStaffCallDto } from './staff-calls.dto.js';
import { STAFF_CALL_INCLUDE, toStaffCallDto } from './staff-calls.mapper.js';

const OPEN_STATUSES: StaffCallStatus[] = [StaffCallStatus.PENDING, StaffCallStatus.ACKNOWLEDGED];

/** Mesa, pedido y mesero a los que se refiere un llamado, deducidos por el servidor. */
interface CallPlace {
  tableId: string | null;
  orderId: string | null;
  waiterId: string | null;
}

/**
 * Llamado abierto equivalente: la misma mesa (o pedido) con el mismo motivo es un solo llamado,
 * lo toque quien lo toque. "Que venga un momento" depende de quién llama, y sin mesa también.
 */
function dedupeKey(
  target: StaffCallTarget,
  reason: StaffCallReason,
  place: CallPlace,
  targetUserId: string | null,
  creatorId: string,
): string {
  const subject = place.tableId ?? (place.orderId ? `order:${place.orderId}` : null);
  const parts = [target, reason, subject ?? '-', targetUserId ?? '*'];
  if (reason === StaffCallReason.COME_OVER || subject === null) parts.push(`by:${creatorId}`);
  return parts.join('|');
}

/**
 * Llamados internos (ADR 0013): cocina y caja llaman al mesero; el mesero llama a caja. Se
 * guardan en la base para que sobrevivan a reconexiones y a que el celular suspenda la app; el
 * socket solo avisa. Repetir un llamado abierto insiste en el mismo.
 */
@Injectable()
export class StaffCallsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  onModuleInit(): void {
    // Cerrar caja termina el turno: lo que nadie cerró no debe seguir sonando mañana.
    this.domainEvents.on('cash.closed', () => this.closeAllOpen());
  }

  /** Abiertos que el usuario hizo o puede atender. */
  async list(user: AuthenticatedUser): Promise<StaffCallDto[]> {
    const answerable = Object.values(StaffCallTarget).filter((target) =>
      canAnswerStaffCall(target, user.permissions),
    );
    const calls = await this.prisma.staffCall.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        OR: [{ createdById: user.id }, { target: { in: answerable } }],
      },
      include: STAFF_CALL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return calls.map(toStaffCallDto);
  }

  async create(dto: CreateStaffCallDto, user: AuthenticatedUser): Promise<StaffCallDto> {
    if (!canCreateStaffCall(dto.target, user.permissions)) {
      throw new ForbiddenException(
        dto.target === StaffCallTarget.WAITER
          ? 'No tienes permiso para llamar al mesero'
          : 'No tienes permiso para llamar a caja',
      );
    }
    if (!STAFF_CALL_REASONS[dto.target].includes(dto.reason)) {
      throw badRequest('Ese motivo no aplica a este llamado');
    }
    const place = await this.resolvePlace(dto);
    if (STAFF_CALL_NEEDS_PLACE.has(dto.reason) && !place.tableId && !place.orderId) {
      throw badRequest('Indica la mesa o el pedido');
    }
    const targetUserId = dto.target === StaffCallTarget.WAITER ? place.waiterId : null;
    const message = dto.message?.trim() ? dto.message.trim() : null;
    const key = dedupeKey(dto.target, dto.reason, place, targetUserId, user.id);

    const existing = await this.findOpenByKey(key);
    if (existing) return this.insist(existing.id, message);
    try {
      const call = await this.prisma.staffCall.create({
        data: {
          target: dto.target,
          reason: dto.reason,
          message,
          tableId: place.tableId,
          orderId: place.orderId,
          targetUserId,
          createdById: user.id,
          dedupeKey: key,
        },
        include: STAFF_CALL_INCLUDE,
      });
      const created = toStaffCallDto(call);
      this.publish(SocketEvent.STAFF_CALL_CREATED, created, true);
      return created;
    } catch (error) {
      // Dos equipos llamaron a la vez: el índice único deja uno y el otro insiste en él.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.findOpenByKey(key);
        if (winner) return this.insist(winner.id, message);
      }
      throw error;
    }
  }

  /** "Voy": quien lo toma queda a la vista de todos para que nadie más vaya. */
  acknowledge(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    return this.transition(id, (call) => {
      if (!canAnswerStaffCall(call.target, user.permissions)) {
        throw new ForbiddenException('Este llamado no es para ti');
      }
      if (call.status === StaffCallStatus.ACKNOWLEDGED) {
        if (call.acknowledgedById === user.id) return null;
        throw conflict(ErrorCode.CONFLICT, `Ya va ${call.acknowledgedBy?.name ?? 'alguien'}`);
      }
      return {
        status: StaffCallStatus.ACKNOWLEDGED,
        acknowledgedById: user.id,
        acknowledgedAt: new Date(),
      };
    });
  }

  /** Atendido: lo cierra quien lo atiende o quien llamó (ya lo resolvieron). */
  resolve(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    return this.transition(id, (call) => {
      if (call.createdById !== user.id && !canAnswerStaffCall(call.target, user.permissions)) {
        throw new ForbiddenException('Este llamado no es para ti');
      }
      return { status: StaffCallStatus.RESOLVED, closedById: user.id, closedAt: new Date() };
    });
  }

  /** Ya no hace falta: solo quien llamó puede retirarlo. */
  cancel(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    return this.transition(id, (call) => {
      if (call.createdById !== user.id) {
        throw new ForbiddenException('Solo quien llamó puede cancelar el llamado');
      }
      return { status: StaffCallStatus.CANCELLED, closedById: user.id, closedAt: new Date() };
    });
  }

  /** Al cobrar el pedido, el "necesito cobrar" de esa cuenta ya quedó atendido. */
  async resolveChargeCalls(orderId: string, user: AuthenticatedUser): Promise<void> {
    const calls = await this.prisma.staffCall.findMany({
      where: {
        orderId,
        target: StaffCallTarget.CASHIER,
        reason: StaffCallReason.CHARGE_TABLE,
        status: { in: OPEN_STATUSES },
      },
      select: { id: true },
    });
    await this.closeMany(
      calls.map((call) => call.id),
      { status: StaffCallStatus.RESOLVED, closedById: user.id },
    );
  }

  private async closeAllOpen(): Promise<void> {
    const calls = await this.prisma.staffCall.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: { id: true },
    });
    await this.closeMany(
      calls.map((call) => call.id),
      { status: StaffCallStatus.CANCELLED, closedById: null },
    );
  }

  private async closeMany(
    ids: string[],
    data: { status: StaffCallStatus; closedById: string | null },
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.staffCall.updateMany({
      where: { id: { in: ids }, status: { in: OPEN_STATUSES } },
      data: { ...data, closedAt: new Date() },
    });
    const calls = await this.prisma.staffCall.findMany({
      where: { id: { in: ids } },
      include: STAFF_CALL_INCLUDE,
    });
    for (const call of calls)
      this.publish(SocketEvent.STAFF_CALL_UPDATED, toStaffCallDto(call), false);
  }

  /**
   * Con pedido: su mesa y su mesero. Con mesa: la cuenta abierta de la mesa (o de la principal si
   * está unida); si hay varias cuentas de meseros distintos, el llamado va a todos.
   */
  private async resolvePlace(dto: CreateStaffCallDto): Promise<CallPlace> {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true, tableId: true, waiterId: true },
      });
      if (!order) throw notFound('El pedido');
      if (dto.tableId && dto.tableId !== order.tableId) {
        throw badRequest('El pedido no es de esa mesa');
      }
      return { tableId: order.tableId, orderId: order.id, waiterId: order.waiterId };
    }
    if (!dto.tableId) return { tableId: null, orderId: null, waiterId: null };
    const table = await this.prisma.diningTable.findFirst({
      where: { id: dto.tableId, deletedAt: null },
      select: { id: true, mergedIntoId: true },
    });
    if (!table) throw notFound('La mesa');
    const orders = await this.prisma.order.findMany({
      where: {
        tableId: table.mergedIntoId ?? table.id,
        status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
      select: { id: true, waiterId: true },
    });
    const waiters = new Set(orders.map((order) => order.waiterId));
    return {
      tableId: table.id,
      orderId: orders.length === 1 ? (orders[0]?.id ?? null) : null,
      waiterId: waiters.size === 1 ? ([...waiters][0] ?? null) : null,
    };
  }

  private findOpenByKey(key: string): Promise<Pick<StaffCall, 'id'> | null> {
    return this.prisma.staffCall.findFirst({
      where: { dedupeKey: key, status: { in: OPEN_STATUSES } },
      select: { id: true },
    });
  }

  /** Vuelve a sonar, salvo que se haya tocado hace un instante (doble toque). */
  private async insist(id: string, message: string | null): Promise<StaffCallDto> {
    const now = new Date();
    const bumped = await this.prisma.staffCall.updateMany({
      where: {
        id,
        status: { in: OPEN_STATUSES },
        lastCalledAt: { lt: new Date(now.getTime() - STAFF_CALL_INSIST_COOLDOWN_MS) },
      },
      data: { callCount: { increment: 1 }, lastCalledAt: now, ...(message ? { message } : {}) },
    });
    const call = toStaffCallDto(
      await this.prisma.staffCall.findUniqueOrThrow({ where: { id }, include: STAFF_CALL_INCLUDE }),
    );
    if (bumped.count > 0) this.publish(SocketEvent.STAFF_CALL_UPDATED, call, true);
    return call;
  }

  /**
   * Cambia el estado solo si nadie lo cambió entre la lectura y la escritura (dos meseros
   * tocando "Voy" a la vez: uno gana y el otro ve quién va).
   */
  private async transition(
    id: string,
    decide: (
      call: StaffCall & { acknowledgedBy: { name: string } | null },
    ) => Prisma.StaffCallUncheckedUpdateManyInput | null,
  ): Promise<StaffCallDto> {
    const call = await this.prisma.staffCall.findUnique({
      where: { id },
      include: { acknowledgedBy: { select: { name: true } } },
    });
    if (!call) throw notFound('El llamado');
    if (!OPEN_STATUSES.includes(call.status)) {
      throw conflict(ErrorCode.CONFLICT, 'Este llamado ya se cerró');
    }
    const data = decide(call);
    if (data) {
      const updated = await this.prisma.staffCall.updateMany({
        where: { id, status: call.status, acknowledgedById: call.acknowledgedById },
        data,
      });
      if (updated.count === 0) {
        throw conflict(ErrorCode.CONFLICT, 'El llamado cambió mientras respondías; revísalo');
      }
    }
    const result = toStaffCallDto(
      await this.prisma.staffCall.findUniqueOrThrow({ where: { id }, include: STAFF_CALL_INCLUDE }),
    );
    if (data) this.publish(SocketEvent.STAFF_CALL_UPDATED, result, false);
    return result;
  }

  /** A quienes lo atienden y a quien llamó (que así ve "Va Laura"). */
  private publish(
    event: typeof SocketEvent.STAFF_CALL_CREATED | typeof SocketEvent.STAFF_CALL_UPDATED,
    call: StaffCallDto,
    alert: boolean,
  ): void {
    const rooms =
      call.target === StaffCallTarget.WAITER
        ? EVENT_ROOMS.staffCallWaiter
        : EVENT_ROOMS.staffCallCashier;
    this.events.publish(event, { call, alert }, [...rooms, userRoom(call.createdBy.id)]);
  }
}
