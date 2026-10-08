import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CashMovementDto,
  type CashSessionDto,
  type CashSessionSummaryDto,
  type ExpenseDto,
  type Paginated,
  type PaymentDto,
  type PaymentResultDto,
  Permission,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { PageQueryDto } from '../../common/http/pagination.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  CreateExpenseDto,
  CreatePaymentDto,
  ExpenseQueryDto,
  OpenCashSessionDto,
  VoidPaymentDto,
} from './cash.dto.js';
import { CashService } from './cash.service.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Caja y pagos')
@ApiBearerAuth()
@Controller()
export class CashController {
  constructor(
    private readonly cash: CashService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('cash-sessions/current')
  @RequirePermissions(Permission.CASH_READ)
  @ApiOperation({ summary: 'Caja abierta con su resumen (null si no hay)' })
  current(): Promise<CashSessionSummaryDto | null> {
    return this.cash.current();
  }

  @Get('cash-sessions')
  @RequirePermissions(Permission.CASH_READ)
  list(@Query() query: PageQueryDto): Promise<Paginated<CashSessionDto>> {
    return this.cash.listSessions(query);
  }

  @Get('cash-sessions/:id')
  @RequirePermissions(Permission.CASH_READ)
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<CashSessionSummaryDto> {
    return this.cash.summary(id);
  }

  @Post('cash-sessions/open')
  @RequirePermissions(Permission.CASH_OPEN)
  open(
    @Body() dto: OpenCashSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CashSessionSummaryDto> {
    return this.cash.open(dto, user);
  }

  @Post('cash-sessions/:id/close')
  @RequirePermissions(Permission.CASH_CLOSE)
  @ApiOperation({ summary: 'Cierra la caja con el efectivo contado y calcula la diferencia' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CashSessionSummaryDto> {
    return this.cash.close(id, dto, user);
  }

  @Get('cash-sessions/:id/movements')
  @RequirePermissions(Permission.CASH_READ)
  movements(@Param('id', ParseUUIDPipe) id: string): Promise<CashMovementDto[]> {
    return this.cash.listMovements(id);
  }

  @Post('cash-sessions/current/movements')
  @RequirePermissions(Permission.CASH_MOVEMENTS)
  @ApiOperation({ summary: 'Ingreso o retiro de efectivo de la caja abierta' })
  addMovement(
    @Body() dto: CreateCashMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CashMovementDto> {
    return this.cash.addMovement(dto, user);
  }

  @Get('expenses')
  @RequirePermissions(Permission.CASH_READ)
  listExpenses(@Query() query: ExpenseQueryDto): Promise<Paginated<ExpenseDto>> {
    return this.cash.listExpenses(query);
  }

  @Post('expenses')
  @RequirePermissions(Permission.EXPENSES_WRITE)
  createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExpenseDto> {
    return this.cash.createExpense(dto, user);
  }

  @Delete('expenses/:id')
  @RequirePermissions(Permission.EXPENSES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.cash.deleteExpense(id, user);
  }

  @Get('orders/:id/payments')
  @RequirePermissions(Permission.ORDERS_READ)
  listPayments(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto[]> {
    return this.payments.listForOrder(id);
  }

  @Post('orders/:id/payments')
  @Idempotent()
  @RequirePermissions(Permission.PAYMENTS_CREATE)
  @ApiOperation({ summary: 'Registra un pago; al completar el total cierra el pedido' })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResultDto> {
    return this.payments.pay(id, dto, user);
  }

  @Post('payments/:id/void')
  @RequirePermissions(Permission.PAYMENTS_VOID)
  voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResultDto> {
    return this.payments.void(id, dto, user);
  }
}
