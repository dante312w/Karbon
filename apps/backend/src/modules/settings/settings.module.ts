import { Global, Module } from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service.js';
import { ConfigCatalogService } from './catalog-config.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, ConfigCatalogService, StorageService],
  exports: [SettingsService, ConfigCatalogService, StorageService],
})
export class SettingsModule {}
