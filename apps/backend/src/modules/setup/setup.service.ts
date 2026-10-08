import { Injectable } from '@nestjs/common';
import { BusinessMode, ErrorCode, type LoginResponse, type SetupStatusDto } from '@karbon/types';
import { conflict } from '../../common/errors/domain-error.js';
import {
  seedAdmin,
  seedBaseConfiguration,
  seedDemoData,
  seedRoles,
} from '../../database/seed/seed-steps.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, type SessionMetadata } from '../auth/auth.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { CompleteSetupDto } from './setup.dto.js';

/** Clave del candado de PostgreSQL que serializa dos asistentes abiertos a la vez. */
const SETUP_LOCK_KEY = 461_734_001;

/**
 * Primer arranque de una instalación nueva: no hay usuarios, así que no existen claves por
 * defecto. El asistente crea la configuración base, el administrador y (opcional) la demo.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async status(): Promise<SetupStatusDto> {
    const [users, settings] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.restaurantSettings.findUnique({ where: { id: 1 } }),
    ]);
    return {
      required: users === 0,
      businessMode: settings?.businessMode ?? BusinessMode.RESTAURANT,
      restaurantName: settings?.name ?? 'Karbon POS',
    };
  }

  async complete(dto: CompleteSetupDto, meta: SessionMetadata): Promise<LoginResponse> {
    const adminId = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
        if ((await tx.user.count({ where: { deletedAt: null } })) > 0) {
          throw conflict(ErrorCode.SETUP_ALREADY_COMPLETED, 'Esta instalación ya está configurada');
        }
        const mode = dto.businessMode;
        const roles = await seedRoles(tx, mode);
        await seedBaseConfiguration(tx, mode, dto.restaurantName.trim());
        await tx.restaurantSettings.update({
          where: { id: 1 },
          data: { name: dto.restaurantName.trim(), businessMode: mode },
        });
        const id = await seedAdmin(tx, roles, {
          name: dto.adminName.trim(),
          username: dto.adminUsername,
          password: dto.adminPassword,
          pin: dto.adminPin ?? null,
        });
        if (dto.loadDemoData) await seedDemoData(tx, mode, roles, id, { businessIdentity: false });
        await this.audit.log(
          {
            userId: id,
            action: 'setup.complete',
            entity: 'settings',
            entityId: '1',
            metadata: { businessMode: mode, demoData: Boolean(dto.loadDemoData) },
          },
          tx,
        );
        return id;
      },
      { timeout: 120_000 },
    );
    this.settings.invalidate();
    return this.auth.startSessionFor(adminId, meta);
  }
}
