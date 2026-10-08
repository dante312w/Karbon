import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type InvoiceDto, type Paginated, Permission, type ReceiptDocument } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/auth/decorators.js';
import { InvoiceQueryDto, IssueInvoiceDto, PrintDto, VoidInvoiceDto } from './billing.dto.js';
import { InvoicesService } from './invoices.service.js';
import { PrintingService } from './printing.service.js';
import { ReceiptBuilder } from './receipt-builder.service.js';

@ApiTags('Facturación e impresión')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly receipts: ReceiptBuilder,
    private readonly printing: PrintingService,
  ) {}

  @Get('orders/:id/receipt')
  @RequirePermissions(Permission.ORDERS_READ)
  @ApiOperation({ summary: 'Precuenta del pedido (documento no fiscal)' })
  preBill(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptDocument> {
    return this.receipts.forOrder(id);
  }

  @Post('orders/:id/receipt/print')
  @RequirePermissions(Permission.ORDERS_READ)
  @HttpCode(HttpStatus.NO_CONTENT)
  async printPreBill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintDto): Promise<void> {
    await this.printing.printReceipt(await this.receipts.forOrder(id), dto.printerId);
  }

  @Post('orders/:id/invoices')
  @RequirePermissions(Permission.INVOICES_ISSUE)
  @ApiOperation({ summary: 'Emite el documento de venta de un pedido pagado (idempotente)' })
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvoiceDto> {
    return this.invoices.issue(id, dto, user);
  }

  @Get('invoices')
  @RequirePermissions(Permission.INVOICES_ISSUE)
  list(@Query() query: InvoiceQueryDto): Promise<Paginated<InvoiceDto>> {
    return this.invoices.list(query);
  }

  @Get('invoices/:id')
  @RequirePermissions(Permission.INVOICES_ISSUE)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceDto> {
    return this.invoices.get(id);
  }

  @Get('invoices/:id/document')
  @RequirePermissions(Permission.INVOICES_ISSUE)
  @ApiOperation({ summary: 'Modelo de presentación para ticket, A4 o PDF' })
  document(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptDocument> {
    return this.invoices.document(id);
  }

  @Post('invoices/:id/print')
  @RequirePermissions(Permission.INVOICES_ISSUE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Imprime el comprobante en una impresora térmica de red' })
  async print(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintDto): Promise<void> {
    await this.printing.printReceipt(
      await this.invoices.document(id),
      dto.printerId,
      dto.openDrawer ?? false,
    );
  }

  @Post('invoices/:id/void')
  @RequirePermissions(Permission.INVOICES_VOID)
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvoiceDto> {
    return this.invoices.void(id, dto.reason, user);
  }

  @Post('printers/:id/test')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async test(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.printing.printTest(id);
  }

  @Post('kitchen/tickets/:id/print')
  @RequireAnyPermission(Permission.KITCHEN_UPDATE, Permission.ORDERS_SEND)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reprintTicket(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.printing.reprintTicket(id);
  }
}
