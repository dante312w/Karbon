import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import {
  ElectronicInvoiceProvider,
  FiscalProviderRegistry,
  LocalFiscalProvider,
} from './fiscal-provider.js';
import { InvoicesService } from './invoices.service.js';
import { PrintingService } from './printing.service.js';
import { ReceiptBuilder } from './receipt-builder.service.js';

@Module({
  controllers: [BillingController],
  providers: [
    InvoicesService,
    ReceiptBuilder,
    PrintingService,
    LocalFiscalProvider,
    ElectronicInvoiceProvider,
    FiscalProviderRegistry,
  ],
})
export class BillingModule {}
