import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { NoteOptionsController } from './note-options.controller.js';
import { NoteOptionsService } from './note-options.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [CatalogController, NoteOptionsController],
  providers: [CatalogService, NoteOptionsService],
})
export class CatalogModule {}
