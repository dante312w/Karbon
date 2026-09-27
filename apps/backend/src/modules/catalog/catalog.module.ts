import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
