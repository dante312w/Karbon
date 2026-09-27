import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service.js';
import { EventsService } from './events.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [EventsService, DomainEventsService, RealtimeGateway],
  exports: [EventsService, DomainEventsService],
})
export class RealtimeModule {}
