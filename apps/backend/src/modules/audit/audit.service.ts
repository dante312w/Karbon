import { Injectable } from '@nestjs/common';
import type { AuditLogDto, Paginated } from '@karbon/types';
import {
  dateRange,
  containsInsensitive,
  pageArgs,
  paginated,
} from '../../common/http/pagination.js';
import { iso } from '../../common/mapping.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../../prisma/prisma.types.js';
import type { AuditLogQueryDto } from './audit.dto.js';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/** Bitácora de acciones sensibles. Se escribe dentro de la misma transacción que la acción. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  /** Más recientes primero. */
  async list(query: AuditLogQueryDto): Promise<Paginated<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.search ? { action: containsInsensitive(query.search) } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...dateRange('createdAt', query),
    };
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
        userId: entry.userId,
        userName: entry.user?.name ?? null,
        createdAt: iso(entry.createdAt),
      })),
      total,
      query,
    );
  }
}
