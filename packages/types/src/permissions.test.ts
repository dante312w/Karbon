import { describe, expect, it } from 'vitest';
import { SystemRole } from './enums.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  isPermission,
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

  it('cocina solo puede ver y actualizar comandas', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.KITCHEN).toEqual([
      Permission.KITCHEN_READ,
      Permission.KITCHEN_UPDATE,
    ]);
  });

  it('el mesero no puede cobrar, cancelar pedidos ni manejar caja', () => {
    const waiter = DEFAULT_ROLE_PERMISSIONS.WAITER;
    expect(waiter).not.toContain(Permission.PAYMENTS_CREATE);
    expect(waiter).not.toContain(Permission.ORDERS_CANCEL);
    expect(waiter.some((p) => p.startsWith('cash:'))).toBe(false);
  });

  it('valida códigos y descarta los desconocidos', () => {
    expect(isPermission('orders:create')).toBe(true);
    expect(isPermission('orders:destroy')).toBe(false);
    expect(toPermissions(['orders:read', 'orders:destroy'])).toEqual([Permission.ORDERS_READ]);
  });
});
