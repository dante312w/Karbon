import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './config/env.validation.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CashModule } from './modules/cash/cash.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { FloorModule } from './modules/floor/floor.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LicenseModule } from './modules/license/license.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SetupModule } from './modules/setup/setup.module.js';
import { StaffCallsModule } from './modules/staff-calls/staff-calls.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SystemModule } from './system/system.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    // Límite general por IP; las rutas de credenciales tienen uno más estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    RealtimeModule,
    AuthModule,
    LicenseModule,
    SettingsModule,
    SetupModule,
    SystemModule,
    UsersModule,
    FloorModule,
    InventoryModule,
    CatalogModule,
    OrdersModule,
    CashModule,
    StaffCallsModule,
    BillingModule,
    CustomersModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
