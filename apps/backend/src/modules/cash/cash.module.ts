import { Module } from '@nestjs/common';
import { FloorModule } from '../floor/floor.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { StaffCallsModule } from '../staff-calls/staff-calls.module.js';
import { CashController } from './cash.controller.js';
import { CashService } from './cash.service.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule, FloorModule, InventoryModule, StaffCallsModule],
  controllers: [CashController],
  providers: [CashService, PaymentsService],
})
export class CashModule {}
