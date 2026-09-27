import { Module } from '@nestjs/common';
import { SettingsModule } from '../modules/settings/settings.module.js';
import { BackupService } from './backup.service.js';
import { BackupsController } from './backups.controller.js';
import { MaintenanceService } from './maintenance.service.js';
import { SystemController } from './system.controller.js';
import { TlsService } from './tls/tls.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [SystemController, BackupsController],
  providers: [MaintenanceService, BackupService, TlsService],
  exports: [TlsService],
})
export class SystemModule {}
