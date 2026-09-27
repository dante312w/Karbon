import { SystemRole } from './enums.js';

/**
 * Permisos RBAC con formato `recurso:acción`. Los roles guardan una lista de estos
 * códigos, lo que permite crear roles personalizados sin cambiar código.
 */
export const Permission = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  AUDIT_READ: 'audit:read',

  TABLES_READ: 'tables:read',
  TABLES_WRITE: 'tables:write',
  TABLES_OPERATE: 'tables:operate',
  RESERVATIONS_READ: 'reservations:read',
  RESERVATIONS_WRITE: 'reservations:write',

  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',

  ORDERS_READ: 'orders:read',
  ORDERS_CREATE: 'orders:create',
  ORDERS_UPDATE: 'orders:update',
  ORDERS_SEND: 'orders:send',
  ORDERS_REQUEST_BILL: 'orders:request_bill',
  ORDERS_CANCEL: 'orders:cancel',
  ORDERS_DISCOUNT: 'orders:discount',

  KITCHEN_READ: 'kitchen:read',
  KITCHEN_UPDATE: 'kitchen:update',

  PAYMENTS_CREATE: 'payments:create',
  PAYMENTS_VOID: 'payments:void',
  CASH_READ: 'cash:read',
  CASH_OPEN: 'cash:open',
  CASH_CLOSE: 'cash:close',
  CASH_MOVEMENTS: 'cash:movements',
  EXPENSES_WRITE: 'expenses:write',
  INVOICES_ISSUE: 'invoices:issue',
  INVOICES_VOID: 'invoices:void',

  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_WRITE: 'suppliers:write',
  PURCHASES_READ: 'purchases:read',
  PURCHASES_WRITE: 'purchases:write',

  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_WRITE: 'customers:write',

  REPORTS_READ: 'reports:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(Object.values(Permission));

const P = Permission;

/** Permisos por defecto de los roles de sistema. Fuente única para el seed y para la UI. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  [SystemRole.ADMIN]: ALL_PERMISSIONS,
  [SystemRole.CASHIER]: [
    P.TABLES_READ,
    P.TABLES_OPERATE,
    P.RESERVATIONS_READ,
    P.RESERVATIONS_WRITE,
    P.CATALOG_READ,
    P.ORDERS_READ,
    P.ORDERS_CREATE,
    P.ORDERS_UPDATE,
    P.ORDERS_SEND,
    P.ORDERS_REQUEST_BILL,
    P.ORDERS_DISCOUNT,
    P.KITCHEN_READ,
    P.PAYMENTS_CREATE,
    P.CASH_READ,
    P.CASH_OPEN,
    P.CASH_CLOSE,
    P.CASH_MOVEMENTS,
    P.EXPENSES_WRITE,
    P.INVOICES_ISSUE,
    P.CUSTOMERS_READ,
    P.CUSTOMERS_WRITE,
  ],
  [SystemRole.WAITER]: [
    P.TABLES_READ,
    P.CATALOG_READ,
    P.ORDERS_READ,
    P.ORDERS_CREATE,
    P.ORDERS_UPDATE,
    P.ORDERS_SEND,
    P.ORDERS_REQUEST_BILL,
    P.KITCHEN_READ,
    P.CUSTOMERS_READ,
  ],
  [SystemRole.KITCHEN]: [P.KITCHEN_READ, P.KITCHEN_UPDATE],
};

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}
