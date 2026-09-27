import { Module } from '@nestjs/common';
import { FloorModule } from '../floor/floor.module.js';
import { KitchenService } from './kitchen.service.js';
import { OrderStore } from './order-store.service.js';
import { KitchenController, OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [FloorModule],
  controllers: [OrdersController, KitchenController],
  providers: [OrdersService, KitchenService, OrderStore],
  exports: [OrderStore],
})
export class OrdersModule {}
