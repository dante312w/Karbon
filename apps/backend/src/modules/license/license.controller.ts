import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type ActivateLicenseRequest, type LicenseStatusDto, Permission } from '@karbon/types';
import { IsString, Length } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { AuditService } from '../audit/audit.service.js';
import { LicenseService } from './license.service.js';

export class ActivateLicenseDto implements ActivateLicenseRequest {
  @IsString() @Length(20, 4096) licenseKey!: string;
}

@ApiTags('Sistema')
@ApiBearerAuth()
@Controller('license')
export class LicenseController {
  constructor(
    private readonly license: LicenseService,
    private readonly audit: AuditService,
  ) {}

  /** Cualquier usuario autenticado ve el estado: el aviso de vencimiento sale en todas las terminales. */
  @Get()
  @ApiOperation({ summary: 'Estado de la licencia o del periodo de prueba' })
  status(): Promise<LicenseStatusDto> {
    return this.license.status();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Activa una licencia firmada' })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ActivateLicenseDto,
  ): Promise<LicenseStatusDto> {
    const status = await this.license.activate(dto.licenseKey);
    await this.audit.log({
      userId: user.id,
      action: 'license.activate',
      entity: 'license',
      metadata: { licensee: status.licensee, plan: status.plan, expiresAt: status.expiresAt },
    });
    return status;
  }
}
