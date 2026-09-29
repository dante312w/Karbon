import { Module } from '@nestjs/common';
import { StaffCallsController } from './staff-calls.controller.js';
import { StaffCallsService } from './staff-calls.service.js';

@Module({
  controllers: [StaffCallsController],
  providers: [StaffCallsService],
  exports: [StaffCallsService],
})
export class StaffCallsModule {}
