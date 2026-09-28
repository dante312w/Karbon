import type { TableDto } from '@karbon/types';
import { canManageAll, type OrderActor } from './order-access.js';

/** Mesa visible como tal en el salón: activa y no unida a otra. */
function isStandalone(table: TableDto): boolean {
  return table.isActive && table.mergedIntoId === null;
}

/** Mesas libres a las que se puede mover o duplicar un pedido. */
export function freeTables(tables: readonly TableDto[], excludeId: string | null): TableDto[] {
  return tables.filter(
    (table) => isStandalone(table) && table.id !== excludeId && table.activeOrders.length === 0,
  );
}

/**
 * Mesas que se pueden unir a `main`: de su misma área, sin unir a otra y con cuentas que el
 * usuario puede operar (libres o suyas; todas con `orders:manage_any`). Las cuentas de la mesa
 * que se une pasan a la principal como cuentas separadas.
 */
export function mergeCandidates(
  main: TableDto,
  tables: readonly TableDto[],
  actor: OrderActor,
): TableDto[] {
  return tables.filter(
    (table) =>
      isStandalone(table) &&
      table.id !== main.id &&
      table.areaId === main.areaId &&
      canManageAll(
        actor,
        table.activeOrders.map((order) => order.waiterId),
      ),
  );
}

/** Mesas unidas a `main` (la principal conserva las cuentas del grupo). */
export function mergedChildren(main: TableDto, tables: readonly TableDto[]): TableDto[] {
  return tables.filter((table) => table.mergedIntoId === main.id);
}
