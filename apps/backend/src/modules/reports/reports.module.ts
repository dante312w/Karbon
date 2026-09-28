import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type DashboardDto,
  type DateRangeQuery,
  OrderStatus,
  PaymentStatus,
  Permission,
} from '@karbon/types';
import { IsOptional, Matches } from 'class-validator';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest } from '../../common/errors/domain-error.js';
import { decimalToMinor } from '../../common/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { StockService } from '../inventory/stock.service.js';
import { SettingsService } from '../settings/settings.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export class DateRangeDto implements DateRangeQuery {
  @IsOptional() @Matches(DATE, { message: 'from debe tener formato YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(DATE, { message: 'to debe tener formato YYYY-MM-DD' }) to?: string;
}

/** Fecha local (YYYY-MM-DD) en la zona horaria del restaurante. */
export function localDate(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function decimal(value: unknown): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value as string | number | Prisma.Decimal);
}

interface Range {
  start: Date;
  end: Date;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
  ) {}

  async dashboard(query: DateRangeDto): Promise<DashboardDto> {
    const settings = await this.settings.get();
    const timezone = settings.timezone;
    const currency = settings.currency;
    const from = query.from ?? localDate(timezone);
    const to = query.to ?? from;
    if (to < from) throw badRequest('La fecha final es anterior a la inicial');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days > MAX_RANGE_DAYS) throw badRequest('El rango máximo es de un año');

    const [bounds] = await this.prisma.$queryRaw<Range[]>`
      SELECT (${from}::date)::timestamp AT TIME ZONE ${timezone} AS "start",
             ((${to}::date) + 1)::timestamp AT TIME ZONE ${timezone} AS "end"`;
    if (!bounds) throw new Error('No se pudo calcular el rango');
    const { start, end } = bounds;
    const paidInRange: Prisma.OrderWhereInput = {
      status: OrderStatus.PAID,
      closedAt: { gte: start, lt: end },
    };
    const minor = (value: unknown): number => decimalToMinor(decimal(value), currency);

    const [
      summary,
      byHour,
      byDay,
      byCategory,
      topProducts,
      byWaiter,
      payments,
      costRow,
      expenses,
      critical,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: paidInRange,
        _sum: { total: true, subtotal: true, tipAmount: true, guests: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ hour: number; total: unknown; orders: number }[]>`
          SELECT EXTRACT(HOUR FROM closed_at AT TIME ZONE ${timezone})::int AS hour,
                 SUM(total) AS total, COUNT(*)::int AS orders
            FROM orders
           WHERE status = 'PAID' AND closed_at >= ${start} AND closed_at < ${end}
           GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ date: string; total: unknown; orders: number }[]>`
          SELECT to_char((closed_at AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS date,
                 SUM(total) AS total, COUNT(*)::int AS orders
            FROM orders
           WHERE status = 'PAID' AND closed_at >= ${start} AND closed_at < ${end}
           GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ category_id: string | null; name: string; total: unknown }[]>`
          SELECT c.id AS category_id, COALESCE(c.name, 'Sin categoría') AS name, SUM(oi.total) AS total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id
            LEFT JOIN categories c ON c.id = p.category_id
           WHERE o.status = 'PAID' AND o.closed_at >= ${start} AND o.closed_at < ${end}
             AND oi.status <> 'CANCELLED'
           GROUP BY c.id, c.name ORDER BY total DESC`,
      this.prisma.$queryRaw<
        { product_id: string; name: string; quantity: number; total: unknown }[]
      >`
          SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity)::int AS quantity, SUM(oi.total) AS total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
           WHERE o.status = 'PAID' AND o.closed_at >= ${start} AND o.closed_at < ${end}
             AND oi.status <> 'CANCELLED'
           GROUP BY oi.product_id ORDER BY quantity DESC, total DESC LIMIT 10`,
      this.prisma.$queryRaw<{ waiter_id: string; name: string; total: unknown; orders: number }[]>`
          SELECT u.id AS waiter_id, u.name, SUM(o.total) AS total, COUNT(*)::int AS orders
            FROM orders o JOIN users u ON u.id = o.waiter_id
           WHERE o.status = 'PAID' AND o.closed_at >= ${start} AND o.closed_at < ${end}
           GROUP BY u.id, u.name ORDER BY total DESC`,
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { status: PaymentStatus.COMPLETED, createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ cost: unknown }[]>`
          SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) AS cost
            FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.status = 'PAID' AND o.closed_at >= ${start} AND o.closed_at < ${end}
             AND oi.status <> 'CANCELLED'`,
      this.prisma.expense.aggregate({
        where: { incurredAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.stock.lowStock(),
    ]);

    const salesTotal = minor(summary._sum.total);
    const ordersCount = summary._count._all;
    const costOfSales = minor(costRow[0]?.cost);
    const expensesTotal = minor(expenses._sum.amount);
    const hours = new Map(byHour.map((row) => [row.hour, row]));

    return {
      from,
      to,
      salesTotal,
      ordersCount,
      averageTicket: ordersCount > 0 ? Math.round(salesTotal / ordersCount) : 0,
      guests: summary._sum.guests ?? 0,
      tipsTotal: minor(summary._sum.tipAmount),
      profit: minor(summary._sum.subtotal) - costOfSales - expensesTotal,
      costOfSales,
      expensesTotal,
      salesByHour: Array.from({ length: 24 }, (_, hour) => {
        const row = hours.get(hour);
        return { hour, total: row ? minor(row.total) : 0, orders: row?.orders ?? 0 };
      }),
      salesByDay: byDay.map((row) => ({
        date: row.date,
        total: minor(row.total),
        orders: row.orders,
      })),
      salesByCategory: byCategory.map((row) => ({
        categoryId: row.category_id,
        name: row.name,
        total: minor(row.total),
      })),
      topProducts: topProducts.map((row) => ({
        productId: row.product_id,
        name: row.name,
        quantity: row.quantity,
        total: minor(row.total),
      })),
      salesByWaiter: byWaiter.map((row) => ({
        waiterId: row.waiter_id,
        name: row.name,
        total: minor(row.total),
        orders: row.orders,
      })),
      paymentsByMethod: payments.map((row) => ({
        method: row.method,
        total: minor(row._sum.amount),
      })),
      criticalInventory: critical,
    };
  }
}

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.REPORTS_READ)
  @ApiOperation({
    summary: 'Indicadores del rango (fechas locales del restaurante; por defecto hoy)',
  })
  dashboard(@Query() query: DateRangeDto): Promise<DashboardDto> {
    return this.reports.dashboard(query);
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
