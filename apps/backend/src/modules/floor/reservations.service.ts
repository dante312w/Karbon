import { Injectable } from '@nestjs/common';
import type { ReservationDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateReservationDto,
  ReservationQueryDto,
  UpdateReservationDto,
} from './floor.dto.js';
import { toReservationDto } from './floor.mapper.js';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ReservationQueryDto): Promise<ReservationDto[]> {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 12 * 60 * 60 * 1000);
    const reservations = await this.prisma.reservation.findMany({
      where: { reservedFor: { gte: from, ...(query.to ? { lte: new Date(query.to) } : {}) } },
      orderBy: { reservedFor: 'asc' },
    });
    return reservations.map(toReservationDto);
  }

  async create(dto: CreateReservationDto, user: AuthenticatedUser): Promise<ReservationDto> {
    const reservation = await this.prisma.reservation.create({
      data: {
        tableId: dto.tableId ?? null,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName.trim(),
        phone: dto.phone ?? null,
        partySize: dto.partySize,
        reservedFor: new Date(dto.reservedFor),
        durationMinutes: dto.durationMinutes ?? 90,
        notes: dto.notes ?? null,
        createdById: user.id,
      },
    });
    return toReservationDto(reservation);
  }

  async update(id: string, dto: UpdateReservationDto): Promise<ReservationDto> {
    const { reservedFor, ...rest } = dto;
    const reservation = await this.prisma.reservation.update({
      where: { id },
      data: { ...rest, ...(reservedFor ? { reservedFor: new Date(reservedFor) } : {}) },
    });
    return toReservationDto(reservation);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.reservation.delete({ where: { id } });
  }
}
