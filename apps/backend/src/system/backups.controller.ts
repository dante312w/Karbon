import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type BackupDto, Permission } from '@karbon/types';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { BackupService } from './backup.service.js';

@ApiTags('Sistema')
@ApiBearerAuth()
@Controller('backups')
export class BackupsController {
  constructor(
    private readonly backups: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Respaldos disponibles (más recientes primero)' })
  list(): Promise<BackupDto[]> {
    return this.backups.list();
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Respalda la base de datos ahora' })
  async create(@CurrentUser() user: AuthenticatedUser): Promise<BackupDto> {
    const backup = await this.backups.create('MANUAL');
    await this.audit.log({
      userId: user.id,
      action: 'backup.create',
      entity: 'backup',
      entityId: backup.fileName,
    });
    return backup;
  }

  @Post(':fileName/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Restaura un respaldo (guarda antes el estado actual)' })
  async restore(@Param('fileName') fileName: string): Promise<void> {
    // No se audita en la base: la restauración la reemplaza (queda en el log del servidor y
    // el estado previo en el respaldo "antes de restaurar").
    await this.backups.restore(fileName);
  }
}
