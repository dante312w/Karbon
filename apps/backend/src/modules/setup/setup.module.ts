import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
