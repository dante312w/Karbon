import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type LicenseState, type LicenseStatusDto } from '@karbon/types';
import { DomainError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InvalidLicenseError, type LicensePayload, verifyLicense } from './license-key.js';

export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Licenciamiento sin conexión: prueba de 30 días desde el primer arranque y licencias
 * firmadas (Ed25519) que se validan localmente. Vencida la licencia, el sistema sigue
 * mostrando y cobrando lo abierto, pero no permite abrir pedidos nuevos.
 */
@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async status(now = new Date()): Promise<LicenseStatusDto> {
    const settings = await this.prisma.restaurantSettings.findUnique({ where: { id: 1 } });
    if (settings?.licenseKey) {
      try {
        return this.describe(verifyLicense(settings.licenseKey), settings.branchId, now);
      } catch (error) {
        // Una clave guardada inválida no debe dejar al negocio sin operar: se ignora.
        this.logger.warn(
          `Licencia guardada inválida: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const startedAt = settings?.setupCompletedAt ?? now;
    const elapsedDays = Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
    return {
      state: trialDaysLeft > 0 ? 'TRIAL' : 'EXPIRED',
      licensee: null,
      plan: null,
      maxTerminals: null,
      expiresAt: new Date(startedAt.getTime() + TRIAL_DAYS * DAY_MS).toISOString(),
      trialDaysLeft,
    };
  }

  async activate(key: string): Promise<LicenseStatusDto> {
    const settings = await this.prisma.restaurantSettings.findUniqueOrThrow({ where: { id: 1 } });
    let payload: LicensePayload;
    try {
      payload = verifyLicense(key);
    } catch (error) {
      if (error instanceof InvalidLicenseError) throw this.invalid(error.message);
      throw error;
    }
    const status = this.describe(payload, settings.branchId, new Date());
    if (status.state !== 'ACTIVE') {
      throw this.invalid(
        status.state === 'EXPIRED' ? 'La licencia ya venció' : 'La licencia es de otra instalación',
      );
    }
    await this.prisma.restaurantSettings.update({
      where: { id: 1 },
      data: { licenseKey: key.trim() },
    });
    return status;
  }

  /** Se llama antes de abrir un pedido nuevo. */
  async assertOperational(): Promise<void> {
    const { state } = await this.status();
    if (state === 'EXPIRED' || state === 'INVALID') {
      throw new DomainError(
        ErrorCode.LICENSE_INVALID,
        'La licencia venció. Actívala en Configuración → Sistema para seguir abriendo pedidos.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private describe(payload: LicensePayload, branchId: string, now: Date): LicenseStatusDto {
    let state: LicenseState = 'ACTIVE';
    if (payload.branchId !== null && payload.branchId !== branchId) state = 'INVALID';
    else if (payload.expiresAt !== null && Date.parse(payload.expiresAt) <= now.getTime()) {
      state = 'EXPIRED';
    }
    return {
      state,
      licensee: payload.licensee,
      plan: payload.plan,
      maxTerminals: payload.maxTerminals,
      expiresAt: payload.expiresAt,
      trialDaysLeft: null,
    };
  }

  private invalid(message: string): DomainError {
    return new DomainError(ErrorCode.LICENSE_INVALID, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
