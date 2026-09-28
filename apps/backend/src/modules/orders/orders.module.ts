import { Module } from '@nestjs/common';
import { FloorModule } from '../floor/floor.module.js';
import { KitchenService } from './kitchen.service.js';
import { OrderStore } from './order-store.service.js';
import { KitchenController, OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TableOperationsController } from './table-operations.controller.js';
import { TableOperationsService } from './table-operations.service.js';

@Module({
  imports: [FloorModule],
  controllers: [OrdersController, KitchenController, TableOperationsController],
  providers: [OrdersService, KitchenService, OrderStore, TableOperationsService],
  exports: [OrderStore],
})
export class OrdersModule {}
