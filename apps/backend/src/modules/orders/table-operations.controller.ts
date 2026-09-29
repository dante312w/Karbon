import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type TableDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { MergeTablesDto } from '../floor/floor.dto.js';
import { TableOperationsService } from './table-operations.service.js';

/** Operaciones de salón que mueven cuentas entre mesas (ver TableOperationsService). */
@ApiTags('Salón')
@ApiBearerAuth()
@Controller('tables')
export class TableOperationsController {
  constructor(private readonly operations: TableOperationsService) {}

  @Post(':id/merge')
  @RequirePermissions(Permission.TABLES_OPERATE)
  @ApiOperation({
    summary: 'Une mesas a esta; sus cuentas pasan a la principal como cuentas separadas',
  })
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeTablesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TableDto> {
    return this.operations.merge(id, dto, user);
  }

  @Post(':id/unmerge')
  @RequirePermissions(Permission.TABLES_OPERATE)
  @ApiOperation({ summary: 'Separa las mesas unidas; las cuentas quedan en la principal' })
  unmerge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TableDto> {
    return this.operations.unmerge(id, user);
  }
}
