import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, PartialType } from '@nestjs/swagger';
import {
  type CreateCustomerRequest,
  type CustomerDto,
  type CustomerHistoryEntry,
  IdentityDocumentType,
  OrderItemStatus,
  OrderStatus,
  type Paginated,
  Permission,
} from '@karbon/types';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors/domain-error.js';
import {
  containsInsensitive,
  pageArgs,
  PageQueryDto,
  paginated,
} from '../../common/http/pagination.js';
import { dateOnly, iso, isoOrNull, timestamps } from '../../common/mapping.js';
import { decimalToMinor } from '../../common/money.js';
import type { Customer, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

export class CreateCustomerDto implements CreateCustomerRequest {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional()
  @IsIn(Object.values(IdentityDocumentType))
  documentType?: IdentityDocumentType | null;
  @IsOptional() @IsString() @MaxLength(30) documentNumber?: string | null;
  @IsOptional() @IsDateString() birthday?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

function toCustomerDto(customer: Customer, currency: string): CustomerDto {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    birthday: dateOnly(customer.birthday),
    address: customer.address,
    notes: customer.notes,
    visitsCount: customer.visitsCount,
    totalSpent: decimalToMinor(customer.totalSpent, currency),
    lastVisitAt: isoOrNull(customer.lastVisitAt),
    ...timestamps(customer),
  };
}

function toData(dto: UpdateCustomerDto): Prisma.CustomerUpdateInput {
  const { birthday, ...rest } = dto;
  return {
    ...rest,
    ...(birthday === undefined ? {} : { birthday: birthday ? new Date(birthday) : null }),
  };
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Búsqueda rápida por nombre, teléfono o documento; sin término, los más recientes. */
  async list(query: PageQueryDto): Promise<Paginated<CustomerDto>> {
    const currency = await this.settings.currency();
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: containsInsensitive(query.search) },
              { phone: { contains: query.search.trim() } },
              { documentNumber: { contains: query.search.trim() } },
            ],
          }
        : {}),
    };
    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginated(
      customers.map((customer) => toCustomerDto(customer, currency)),
      total,
      query,
    );
  }

  async get(id: string): Promise<CustomerDto> {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw notFound('El cliente');
    return toCustomerDto(customer, await this.settings.currency());
  }

  async create(dto: CreateCustomerDto): Promise<CustomerDto> {
    const customer = await this.prisma.customer.create({
      data: { ...(toData(dto) as Prisma.CustomerCreateInput), name: dto.name.trim() },
    });
    return toCustomerDto(customer, await this.settings.currency());
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerDto> {
    const customer = await this.prisma.customer.update({ where: { id }, data: toData(dto) });
    return toCustomerDto(customer, await this.settings.currency());
  }

  async remove(id: string): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async history(id: string): Promise<CustomerHistoryEntry[]> {
    const currency = await this.settings.currency();
    const orders = await this.prisma.order.findMany({
      where: { customerId: id, status: OrderStatus.PAID },
      orderBy: { closedAt: 'desc' },
      take: 100,
      include: {
        items: {
          where: { status: { not: OrderItemStatus.CANCELLED } },
          select: { quantity: true },
        },
      },
    });
    return orders.map((order) => ({
      orderId: order.id,
      number: order.number,
      closedAt: order.closedAt ? iso(order.closedAt) : null,
      total: decimalToMinor(order.total, currency),
      items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    }));
  }
}

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Búsqueda rápida por nombre, teléfono o documento' })
  list(@Query() query: PageQueryDto): Promise<Paginated<CustomerDto>> {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.CUSTOMERS_READ)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    return this.customers.get(id);
  }

  @Get(':id/history')
  @RequirePermissions(Permission.CUSTOMERS_READ)
  history(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerHistoryEntry[]> {
    return this.customers.history(id);
  }

  @Post()
  @RequirePermissions(Permission.CUSTOMERS_WRITE)
  create(@Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CUSTOMERS_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CUSTOMERS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.customers.remove(id);
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
