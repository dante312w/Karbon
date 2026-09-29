import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type StaffCallDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequireAnyPermission } from '../../common/auth/decorators.js';
import { CreateStaffCallDto } from './staff-calls.dto.js';
import { StaffCallsService } from './staff-calls.service.js';

const CALLERS = [Permission.CALLS_WAITER, Permission.CALLS_CASHIER] as const;
const ANSWERERS = [Permission.ORDERS_DELIVER, Permission.PAYMENTS_CREATE] as const;

/** Llamados internos. El servicio exige el permiso exacto de cada destino. */
@ApiTags('Llamados')
@ApiBearerAuth()
@Controller('staff-calls')
export class StaffCallsController {
  constructor(private readonly calls: StaffCallsService) {}

  @Get()
  @RequireAnyPermission(...CALLERS, ...ANSWERERS)
  @ApiOperation({ summary: 'Llamados abiertos que hice o que puedo atender' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<StaffCallDto[]> {
    return this.calls.list(user);
  }

  @Post()
  @RequireAnyPermission(...CALLERS)
  @ApiOperation({ summary: 'Llama al mesero o a caja; repetir un llamado abierto insiste en él' })
  create(
    @Body() dto: CreateStaffCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StaffCallDto> {
    return this.calls.create(dto, user);
  }

  @Post(':id/acknowledge')
  @RequireAnyPermission(...ANSWERERS)
  @ApiOperation({ summary: '"Voy": toma el llamado' })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StaffCallDto> {
    return this.calls.acknowledge(id, user);
  }

  @Post(':id/resolve')
  @RequireAnyPermission(...CALLERS, ...ANSWERERS)
  @ApiOperation({ summary: 'Marca el llamado como atendido' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StaffCallDto> {
    return this.calls.resolve(id, user);
  }

  @Post(':id/cancel')
  @RequireAnyPermission(...CALLERS)
  @ApiOperation({ summary: 'Retira un llamado propio que ya no hace falta' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StaffCallDto> {
    return this.calls.cancel(id, user);
  }
}
