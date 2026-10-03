import { ForbiddenException, Injectable, type OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ErrorCode,
  SocketEvent,
  type StaffCallDto,
  StaffCallReason,
  type StaffCallRecipientDto,
  StaffCallStatus,
  StaffCallTarget,
  toPermissions,
  userRoom,
} from '@karbon/types';
import {
  ACTIVE_ORDER_STATUSES,
  canAnswerStaffCall,
  canAnswerStaffCallAs,
  canCreateStaffCall,
  isWaiterCallRecipient,
  STAFF_CALL_INSIST_COOLDOWN_MS,
  STAFF_CALL_NEEDS_PLACE,
  STAFF_CALL_REASONS,
  type StaffCallAudience,
} from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, notFound } from '../../common/errors/domain-error.js';
import { Prisma, type StaffCall } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DomainEventsService } from '../realtime/domain-events.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { CreateStaffCallDto } from './staff-calls.dto.js';
import { STAFF_CALL_INCLUDE, toStaffCallDto } from './staff-calls.mapper.js';

const OPEN_STATUSES: StaffCallStatus[] = [StaffCallStatus.PENDING, StaffCallStatus.ACKNOWLEDGED];

/** Cada cuánto se revisan los llamados sin respuesta para escalarlos. */
const ESCALATION_SWEEP_MS = 5_000;

/** Mesa y pedido a los que se refiere un llamado, deducidos por el servidor. */
interface CallPlace {
  tableId: string | null;
  orderId: string | null;
}

/**
 * Llamado abierto equivalente: la misma mesa (o pedido) con el mismo motivo y destinatario es un
 * solo llamado, lo toque quien lo toque. "Que venga un momento" depende de quién llama, y sin
 * mesa también.
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

type CallWithAcknowledger = StaffCall & { acknowledgedBy: { name: string } | null };

/** El llamado tal como lo evalúan las reglas compartidas (@karbon/utils). */
function asRecipientView(call: StaffCall): StaffCallAudience & { target: StaffCallTarget } {
  return {
    target: call.target,
    targetUser: call.targetUserId ? { id: call.targetUserId } : null,
    escalatedAt: call.escalatedAt,
  };
}

/**
 * Llamados internos (ADR 0013): cocina y caja llaman a un mesero (o a todos); el mesero llama a
 * caja. Se guardan en la base para que sobrevivan a reconexiones y a que el celular suspenda la
 * app; el socket solo avisa, y solo a quien le corresponde. Repetir un llamado abierto insiste en
 * el mismo; si nadie responde a tiempo, el de un mesero pasa a todos (configurable).
 */
@Injectable()
export class StaffCallsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly domainEvents: DomainEventsService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    // Cerrar caja termina el turno: lo que nadie cerró no debe seguir sonando mañana.
    this.domainEvents.on('cash.closed', () => this.closeAllOpen());
  }

  /**
   * Abiertos que el usuario hizo o puede atender. Un mesero no ve los dirigidos a otro mesero
   * (salvo que se hayan escalado).
   */
  async list(user: AuthenticatedUser): Promise<StaffCallDto[]> {
    const visible: Prisma.StaffCallWhereInput[] = [{ createdById: user.id }];
    if (canAnswerStaffCall(StaffCallTarget.CASHIER, user.permissions)) {
      visible.push({ target: StaffCallTarget.CASHIER });
    }
    if (canAnswerStaffCall(StaffCallTarget.WAITER, user.permissions)) {
      visible.push({
        target: StaffCallTarget.WAITER,
        OR: [{ targetUserId: null }, { targetUserId: user.id }, { escalatedAt: { not: null } }],
      });
    }
    const calls = await this.prisma.staffCall.findMany({
      where: { status: { in: OPEN_STATUSES }, OR: visible },
      include: STAFF_CALL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return calls.map(toStaffCallDto);
  }

  /** Meseros que se pueden elegir al llamar, primero los que tienen un equipo conectado. */
  async recipients(): Promise<StaffCallRecipientDto[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, role: { select: { name: true, permissions: true } } },
      orderBy: { name: 'asc' },
    });
    const waiters = users.filter((user) =>
      isWaiterCallRecipient(toPermissions(user.role.permissions)),
    );
    const online = this.events.connectedUsers(waiters.map((user) => user.id));
    return waiters
      .map((user) => ({
        id: user.id,
        name: user.name,
        roleName: user.role.name,
        online: online.has(user.id),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online));
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
    if (dto.target === StaffCallTarget.CASHIER && dto.waiterId) {
      throw badRequest('Un llamado a caja no va a un mesero');
    }
    const place = await this.resolvePlace(dto);
    if (STAFF_CALL_NEEDS_PLACE.has(dto.reason) && !place.tableId && !place.orderId) {
      throw badRequest('Indica la mesa o el pedido');
    }
    const targetUserId = dto.waiterId ? await this.assertWaiter(dto.waiterId) : null;
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

  /**
   * "Vista": el aviso apareció en el equipo de quien lo atiende. Lo marca el propio equipo al
   * mostrarlo; solo cuenta la primera vez y no suena en nadie.
   */
  async markSeen(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    const call = await this.prisma.staffCall.findUnique({ where: { id } });
    if (!call) throw notFound('El llamado');
    if (!canAnswerStaffCallAs(asRecipientView(call), user)) {
      throw new ForbiddenException('Este llamado no es para ti');
    }
    const marked = await this.prisma.staffCall.updateMany({
      where: { id, seenAt: null, status: { in: OPEN_STATUSES } },
      data: { seenAt: new Date(), seenById: user.id },
    });
    const result = toStaffCallDto(
      await this.prisma.staffCall.findUniqueOrThrow({ where: { id }, include: STAFF_CALL_INCLUDE }),
    );
    if (marked.count > 0) this.publish(SocketEvent.STAFF_CALL_UPDATED, result, false);
    return result;
  }

  /** "Voy": quien lo toma queda a la vista de todos para que nadie más vaya. */
  acknowledge(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    return this.transition(id, (call) => {
      this.assertRecipient(call, user);
      if (call.status === StaffCallStatus.ACKNOWLEDGED) {
        if (call.acknowledgedById === user.id) return null;
        throw conflict(ErrorCode.CONFLICT, `Ya va ${call.acknowledgedBy?.name ?? 'alguien'}`);
      }
      const now = new Date();
      return {
        status: StaffCallStatus.ACKNOWLEDGED,
        acknowledgedById: user.id,
        acknowledgedAt: now,
        // Tomarlo implica haberlo visto, aunque el equipo no alcanzara a marcarlo.
        ...(call.seenAt ? {} : { seenAt: now, seenById: user.id }),
      };
    });
  }

  /** Atendido: lo cierra quien lo atiende o quien llamó (ya lo resolvieron). */
  resolve(id: string, user: AuthenticatedUser): Promise<StaffCallDto> {
    return this.transition(id, (call) => {
      if (call.createdById !== user.id) this.assertRecipient(call, user);
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

  /**
   * Un llamado a un mesero que nadie tomó en el tiempo configurado pasa a todos los meseros
   * (suena de nuevo en todos). Con 0 segundos no se escala nunca.
   */
  @Interval(ESCALATION_SWEEP_MS)
  async escalateOverdue(now = new Date()): Promise<number> {
    const seconds = (await this.settings.get()).staffCallEscalateSeconds;
    if (seconds <= 0) return 0;
    const overdue = {
      target: StaffCallTarget.WAITER,
      status: StaffCallStatus.PENDING,
      targetUserId: { not: null },
      escalatedAt: null,
      createdAt: { lte: new Date(now.getTime() - seconds * 1_000) },
    } satisfies Prisma.StaffCallWhereInput;
    const calls = await this.prisma.staffCall.findMany({ where: overdue, select: { id: true } });
    if (calls.length === 0) return 0;
    const ids = calls.map((call) => call.id);
    // La misma condición en la escritura: si alguien tomó el llamado entre medio, no se escala.
    await this.prisma.staffCall.updateMany({
      where: { ...overdue, id: { in: ids } },
      data: { escalatedAt: now },
    });
    const escalated = await this.prisma.staffCall.findMany({
      where: { id: { in: ids }, escalatedAt: now },
      include: STAFF_CALL_INCLUDE,
    });
    for (const call of escalated) {
      this.publish(SocketEvent.STAFF_CALL_UPDATED, toStaffCallDto(call), true);
    }
    return escalated.length;
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

  /** El mesero elegido debe existir, estar activo y atender mesas. */
  private async assertWaiter(waiterId: string): Promise<string> {
    const waiter = await this.prisma.user.findFirst({
      where: { id: waiterId, deletedAt: null },
      select: { id: true, isActive: true, role: { select: { permissions: true } } },
    });
    if (!waiter) throw notFound('El mesero');
    if (!waiter.isActive || !isWaiterCallRecipient(toPermissions(waiter.role.permissions))) {
      throw badRequest('Ese usuario no atiende mesas; elige otro mesero o llama a todos');
    }
    return waiter.id;
  }

  private assertRecipient(call: StaffCall, user: AuthenticatedUser): void {
    if (!canAnswerStaffCallAs(asRecipientView(call), user)) {
      throw new ForbiddenException('Este llamado no es para ti');
    }
  }

  /** Con pedido: su mesa. Con mesa: la cuenta abierta de la mesa (o de la principal si está unida). */
  private async resolvePlace(dto: CreateStaffCallDto): Promise<CallPlace> {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true, tableId: true },
      });
      if (!order) throw notFound('El pedido');
      if (dto.tableId && dto.tableId !== order.tableId) {
        throw badRequest('El pedido no es de esa mesa');
      }
      return { tableId: order.tableId, orderId: order.id };
    }
    if (!dto.tableId) return { tableId: null, orderId: null };
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
      select: { id: true },
    });
    return { tableId: table.id, orderId: orders.length === 1 ? (orders[0]?.id ?? null) : null };
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
    decide: (call: CallWithAcknowledger) => Prisma.StaffCallUncheckedUpdateManyInput | null,
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

  /**
   * A quienes lo atienden y a quien llamó (que así ve "Vista", "Va Laura"). El dirigido a un
   * mesero solo llega a sus equipos; el general o escalado, a todos los meseros.
   */
  private publish(
    event: typeof SocketEvent.STAFF_CALL_CREATED | typeof SocketEvent.STAFF_CALL_UPDATED,
    call: StaffCallDto,
    alert: boolean,
  ): void {
    const audience =
      call.target === StaffCallTarget.CASHIER
        ? EVENT_ROOMS.staffCallCashier
        : call.targetUser && call.escalatedAt === null
          ? [userRoom(call.targetUser.id)]
          : EVENT_ROOMS.staffCallWaiter;
    this.events.publish(event, { call, alert }, [
      ...new Set([...audience, userRoom(call.createdBy.id)]),
    ]);
  }
}
