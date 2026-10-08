import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Limpieza nocturna de datos técnicos que ya no aportan valor. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    const now = Date.now();
    const [keys, tokens] = await this.prisma.$transaction([
      this.prisma.idempotencyKey.deleteMany({
        where: { createdAt: { lt: new Date(now - 2 * DAY_MS) } },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date(now - 7 * DAY_MS) } },
      }),
    ]);
    this.logger.log(
      `Limpieza: ${keys.count} claves de idempotencia, ${tokens.count} sesiones vencidas`,
    );
  }
}
