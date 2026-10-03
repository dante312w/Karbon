import { Module } from '@nestjs/common';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  controllers: [FloorController],
  providers: [FloorService, ReservationsService],
  exports: [FloorService],
})
export class FloorModule {}
