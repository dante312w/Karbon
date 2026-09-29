import { Injectable } from '@nestjs/common';
import {
  type BusinessMode,
  type RestaurantSettingsDto,
  SocketEvent,
  SystemRole,
  systemRolePermissions,
} from '@karbon/types';
import { getTerminology, SUPPORTED_CURRENCIES } from '@karbon/utils';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest } from '../../common/errors/domain-error.js';
import { StorageService } from '../../common/storage/storage.service.js';
import type { RestaurantSettings } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EventsService } from '../realtime/events.service.js';
import type { UpdateSettingsDto } from './settings.dto.js';
import { toSettingsDto } from './settings.mapper.js';

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * La configuración se lee en casi todas las operaciones (moneda, impuestos, modo): se guarda
 * en memoria y se invalida al actualizarla. Hay un único proceso backend por sucursal.
 */
@Injectable()
export class SettingsService {
  private cached: RestaurantSettings | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async get(): Promise<RestaurantSettings> {
    this.cached ??= await this.prisma.restaurantSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: 'Mi Restaurante' },
    });
    return this.cached;
  }

  async currency(): Promise<string> {
    return (await this.get()).currency;
  }

  async businessMode(): Promise<BusinessMode> {
    return (await this.get()).businessMode;
  }

  async getDto(): Promise<RestaurantSettingsDto> {
    return toSettingsDto(await this.get());
  }

  invalidate(): void {
    this.cached = null;
  }

  async update(dto: UpdateSettingsDto, user: AuthenticatedUser): Promise<RestaurantSettingsDto> {
    const current = await this.get();
    const warning = dto.kdsWarningMinutes ?? current.kdsWarningMinutes;
    const critical = dto.kdsCriticalMinutes ?? current.kdsCriticalMinutes;
    if (warning >= critical) {
      throw badRequest('El umbral amarillo del KDS debe ser menor que el rojo');
    }
    if (dto.currency && !SUPPORTED_CURRENCIES.includes(dto.currency)) {
      throw badRequest(`Moneda no soportada. Opciones: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw badRequest('Zona horaria inválida');
    }

    const before = toSettingsDto(current);
    const changed = (Object.keys(dto) as (keyof UpdateSettingsDto)[]).filter(
      (key) => JSON.stringify(dto[key]) !== JSON.stringify(before[key]),
    );
    const { openingHours, ...fields } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.restaurantSettings.update({
        where: { id: 1 },
        data: {
          ...fields,
          ...(openingHours
            ? {
                openingHours: openingHours.map(({ day, opensAt, closesAt }) => ({
                  day,
                  opensAt,
                  closesAt,
                })),
              }
            : {}),
        },
      });
      if (dto.businessMode && dto.businessMode !== current.businessMode) {
        // El rol que opera el tablero se llama Cocina o Barra según el modo, y en bar también
        // confirma las entregas.
        await tx.role.updateMany({
          where: { code: SystemRole.KITCHEN, isSystem: true },
          data: {
            name: getTerminology(dto.businessMode).prepRoleName,
            permissions: systemRolePermissions(SystemRole.KITCHEN, dto.businessMode),
          },
        });
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'settings.update',
          entity: 'restaurant_settings',
          entityId: '1',
          metadata: { fields: changed },
        },
        tx,
      );
      return settings;
    });
    return this.publish(updated);
  }

  async updateLogo(dataUrl: string, user: AuthenticatedUser): Promise<RestaurantSettingsDto> {
    const logoPath = await this.storage.saveImage('branding', 'logo', dataUrl);
    const updated = await this.prisma.restaurantSettings.update({
      where: { id: 1 },
      data: { logoPath },
    });
    await this.audit.log({
      userId: user.id,
      action: 'settings.logo',
      entity: 'restaurant_settings',
      entityId: '1',
    });
    return this.publish(updated);
  }

  async logoFile(): Promise<string | null> {
    const settings = await this.get();
    return settings.logoPath ? this.storage.uploadPath(settings.logoPath) : null;
  }

  private publish(settings: RestaurantSettings): RestaurantSettingsDto {
    this.cached = settings;
    const dto = toSettingsDto(settings);
    this.events.broadcast(SocketEvent.SETTINGS_UPDATED, { settings: dto });
    return dto;
  }
}
