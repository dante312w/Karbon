import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AreaDto,
  type FloorElementDto,
  Permission,
  type ReservationDto,
  type TableDto,
} from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import {
  CreateAreaDto,
  CreateFloorElementDto,
  CreateReservationDto,
  CreateTableDto,
  ReservationQueryDto,
  SetTableStatusDto,
  TableQueryDto,
  UpdateAreaDto,
  UpdateFloorElementDto,
  UpdateReservationDto,
  UpdateTableDto,
} from './floor.dto.js';
import { FloorService } from './floor.service.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('Salón')
@ApiBearerAuth()
@Controller()
export class FloorController {
  constructor(
    private readonly floor: FloorService,
    private readonly reservations: ReservationsService,
  ) {}

  @Get('areas')
  @RequirePermissions(Permission.TABLES_READ)
  listAreas(): Promise<AreaDto[]> {
    return this.floor.listAreas();
  }

  @Post('areas')
  @RequirePermissions(Permission.TABLES_WRITE)
  createArea(@Body() dto: CreateAreaDto): Promise<AreaDto> {
    return this.floor.createArea(dto);
  }

  @Patch('areas/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  updateArea(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto): Promise<AreaDto> {
    return this.floor.updateArea(id, dto);
  }

  @Delete('areas/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteArea(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.floor.deleteArea(id);
  }

  @Post('areas/:id/elements')
  @RequirePermissions(Permission.TABLES_WRITE)
  @ApiOperation({ summary: 'Agrega barra, cocina, baños, entrada, caja o pared al plano del área' })
  createElement(
    @Param('id', ParseUUIDPipe) areaId: string,
    @Body() dto: CreateFloorElementDto,
  ): Promise<FloorElementDto> {
    return this.floor.createElement(areaId, dto);
  }

  @Patch('floor-elements/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  updateElement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFloorElementDto,
  ): Promise<FloorElementDto> {
    return this.floor.updateElement(id, dto);
  }

  @Delete('floor-elements/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteElement(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.floor.deleteElement(id);
  }

  @Get('tables')
  @RequirePermissions(Permission.TABLES_READ)
  @ApiOperation({ summary: 'Mapa de mesas con el resumen de sus pedidos activos' })
  listTables(@Query() query: TableQueryDto): Promise<TableDto[]> {
    return this.floor.listTables(query);
  }

  @Get('tables/:id')
  @RequirePermissions(Permission.TABLES_READ)
  getTable(@Param('id', ParseUUIDPipe) id: string): Promise<TableDto> {
    return this.floor.getTable(id);
  }

  @Post('tables')
  @RequirePermissions(Permission.TABLES_WRITE)
  createTable(@Body() dto: CreateTableDto): Promise<TableDto> {
    return this.floor.createTable(dto);
  }

  @Patch('tables/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  updateTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ): Promise<TableDto> {
    return this.floor.updateTable(id, dto);
  }

  @Delete('tables/:id')
  @RequirePermissions(Permission.TABLES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.floor.deleteTable(id, user);
  }

  // Unir y separar mesas mueve cuentas: vive en el módulo de pedidos (TableOperationsController).

  @Patch('tables/:id/status')
  @RequirePermissions(Permission.TABLES_OPERATE)
  @ApiOperation({ summary: 'Libera (tras pagar/limpiar) o reserva una mesa sin pedidos activos' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTableStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TableDto> {
    return this.floor.setStatus(id, dto, user);
  }

  @Get('reservations')
  @RequirePermissions(Permission.RESERVATIONS_READ)
  listReservations(@Query() query: ReservationQueryDto): Promise<ReservationDto[]> {
    return this.reservations.list(query);
  }

  @Post('reservations')
  @RequirePermissions(Permission.RESERVATIONS_WRITE)
  createReservation(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReservationDto> {
    return this.reservations.create(dto, user);
  }

  @Patch('reservations/:id')
  @RequirePermissions(Permission.RESERVATIONS_WRITE)
  updateReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationDto,
  ): Promise<ReservationDto> {
    return this.reservations.update(id, dto);
  }

  @Delete('reservations/:id')
  @RequirePermissions(Permission.RESERVATIONS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReservation(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reservations.remove(id);
  }
}
