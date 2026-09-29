import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type KitchenTicketDto, type OrderDto, type Paginated, Permission } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { KitchenService } from './kitchen.service.js';
import {
  AddItemsDto,
  CancelDto,
  CancelItemDto,
  CreateOrderDto,
  DuplicateOrderDto,
  MoveOrderDto,
  OptionalVersionDto,
  OrderQueryDto,
  ReorderItemsDto,
  SetOrderDiscountDto,
  SplitOrderDto,
  TicketQueryDto,
  UpdateItemDto,
  UpdateOrderDto,
  UpdateTicketStatusDto,
  VersionDto,
} from './orders.dto.js';
import { OrdersService } from './orders.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Clave única del cliente: reintentar con la misma clave no repite la operación',
};

@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly kitchen: KitchenService,
  ) {}

  @Get()
  @RequirePermissions(Permission.ORDERS_READ)
  list(@Query() query: OrderQueryDto): Promise<Paginated<OrderDto>> {
    return this.orders.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.ORDERS_READ)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDto> {
    return this.orders.get(id);
  }

  @Post()
  @Idempotent()
  @RequirePermissions(Permission.ORDERS_CREATE)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Crea un pedido (opcionalmente con ítems y enviándolo de inmediato)' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser): Promise<OrderDto> {
    return this.orders.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.update(id, dto, user);
  }

  @Post(':id/items')
  @Idempotent()
  @RequirePermissions(Permission.ORDERS_UPDATE)
  @ApiHeader(IDEMPOTENCY_HEADER)
  addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.addItems(id, dto, user);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Cambia cantidad o notas (pendientes) o el descuento (con permiso)' })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.updateItem(id, itemId, dto, user);
  }

  @Put(':id/discount')
  @RequirePermissions(Permission.ORDERS_DISCOUNT)
  @ApiOperation({
    summary: 'Aplica, cambia o quita (null) el descuento sobre el total (porcentaje o valor)',
  })
  setDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.setDiscount(id, dto, user);
  }

  @Post(':id/items/:itemId/cancel')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  cancelItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CancelItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.cancelItem(id, itemId, dto, user);
  }

  @Post(':id/items/:itemId/duplicate')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  duplicateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: VersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.duplicateItem(id, itemId, dto.version, user);
  }

  @Put(':id/items/order')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Reordena los ítems del ticket' })
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.reorderItems(id, dto, user);
  }

  @Post(':id/send')
  @Idempotent()
  @RequirePermissions(Permission.ORDERS_SEND)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Envía los ítems pendientes a cocina/barra (una comanda por estación)' })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionalVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.send(id, dto.version, user);
  }

  @Post(':id/tickets/:ticketId/deliver')
  @RequirePermissions(Permission.ORDERS_DELIVER)
  @ApiOperation({
    summary:
      'Confirma que una comanda lista llegó a la mesa (mesero del pedido o quien opera todos)',
  })
  deliverTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.kitchen.deliver(id, ticketId, user);
  }

  @Post(':id/tickets/:ticketId/undeliver')
  @RequirePermissions(Permission.ORDERS_DELIVER)
  @ApiOperation({ summary: 'Deshace una entrega confirmada por error (vuelve a "Listo")' })
  undeliverTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.kitchen.undoDelivery(id, ticketId, user);
  }

  @Post(':id/request-bill')
  @RequirePermissions(Permission.ORDERS_REQUEST_BILL)
  requestBill(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionalVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.requestBill(id, dto.version, user);
  }

  @Post(':id/move')
  @RequirePermissions(Permission.TABLES_OPERATE)
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.move(id, dto, user);
  }

  @Post(':id/split')
  @RequirePermissions(Permission.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Divide la cuenta por ítems; devuelve el pedido nuevo' })
  split(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SplitOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.split(id, dto, user);
  }

  @Post(':id/duplicate')
  @RequirePermissions(Permission.ORDERS_CREATE)
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.duplicate(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.ORDERS_CANCEL)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDto> {
    return this.orders.cancel(id, dto, user);
  }
}

@ApiTags('Cocina / barra')
@ApiBearerAuth()
@Controller('kitchen/tickets')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get()
  @RequirePermissions(Permission.KITCHEN_READ)
  @ApiOperation({ summary: 'Comandas activas del KDS (filtrables por estación)' })
  list(@Query() query: TicketQueryDto): Promise<KitchenTicketDto[]> {
    return this.kitchen.list(query);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.KITCHEN_UPDATE)
  @ApiOperation({
    summary: 'Nuevo → Preparando → Listo (o deshacer un paso); la entrega la confirma el mesero',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KitchenTicketDto> {
    return this.kitchen.updateStatus(id, dto.status, user);
  }
}
