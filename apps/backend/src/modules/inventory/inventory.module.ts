import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { ProductCostService } from './product-cost.service.js';
import { StockService } from './stock.service.js';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockService, ProductCostService],
  exports: [StockService, ProductCostService],
})
export class InventoryModule {}
