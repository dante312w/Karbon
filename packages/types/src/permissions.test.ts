import { describe, expect, it } from 'vitest';
import { BusinessMode, SystemRole } from './enums.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  isPermission,
  systemRolePermissions,
  toPermissions,
} from './permissions.js';

describe('permisos RBAC', () => {
  it('no tiene códigos duplicados y todos siguen el formato recurso:acción', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+:[a-z_]+$/);
    }
  });

  it('define permisos por defecto para cada rol de sistema', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(Object.values(SystemRole).sort());
  });

  it('el administrador tiene todos los permisos', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toEqual(ALL_PERMISSIONS);
  });

  it('cocina solo puede ver y actualizar comandas y llamar al mesero', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.KITCHEN).toEqual([
      Permission.KITCHEN_READ,
      Permission.KITCHEN_UPDATE,
      Permission.CALLS_WAITER,
    ]);
  });

  it('el mesero llama a caja; caja y cocina llaman al mesero', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.WAITER).toContain(Permission.CALLS_CASHIER);
    expect(DEFAULT_ROLE_PERMISSIONS.WAITER).not.toContain(Permission.CALLS_WAITER);
    expect(DEFAULT_ROLE_PERMISSIONS.CASHIER).toContain(Permission.CALLS_WAITER);
    expect(DEFAULT_ROLE_PERMISSIONS.CASHIER).not.toContain(Permission.CALLS_CASHIER);
  });

  it('el mesero no puede cobrar, cancelar pedidos ni manejar caja', () => {
    const waiter = DEFAULT_ROLE_PERMISSIONS.WAITER;
    expect(waiter).not.toContain(Permission.PAYMENTS_CREATE);
    expect(waiter).not.toContain(Permission.ORDERS_CANCEL);
    expect(waiter.some((p) => p.startsWith('cash:'))).toBe(false);
  });

  it('el mesero confirma entregas de sus pedidos; caja puede operar los de todos', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.WAITER).toContain(Permission.ORDERS_DELIVER);
    expect(DEFAULT_ROLE_PERMISSIONS.WAITER).not.toContain(Permission.ORDERS_MANAGE_ANY);
    expect(DEFAULT_ROLE_PERMISSIONS.CASHIER).toContain(Permission.ORDERS_DELIVER);
    expect(DEFAULT_ROLE_PERMISSIONS.CASHIER).toContain(Permission.ORDERS_MANAGE_ANY);
  });

  it('en modo bar la barra entrega lo que prepara; en restaurante, no', () => {
    expect(systemRolePermissions(SystemRole.KITCHEN, BusinessMode.RESTAURANT)).toEqual(
      DEFAULT_ROLE_PERMISSIONS.KITCHEN,
    );
    expect(systemRolePermissions(SystemRole.KITCHEN, BusinessMode.BAR)).toEqual([
      Permission.KITCHEN_READ,
      Permission.KITCHEN_UPDATE,
      Permission.CALLS_WAITER,
      Permission.ORDERS_DELIVER,
      Permission.ORDERS_MANAGE_ANY,
    ]);
    expect(systemRolePermissions(SystemRole.WAITER, BusinessMode.BAR)).toEqual(
      DEFAULT_ROLE_PERMISSIONS.WAITER,
    );
  });

  it('valida códigos y descarta los desconocidos', () => {
    expect(isPermission('orders:create')).toBe(true);
    expect(isPermission('orders:destroy')).toBe(false);
    expect(toPermissions(['orders:read', 'orders:destroy'])).toEqual([Permission.ORDERS_READ]);
  });
});
