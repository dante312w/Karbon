import { DEFAULT_ROLE_PERMISSIONS } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { roomsFor } from './rooms.js';

describe('salas de Socket.io por permisos', () => {
  it('cocina solo escucha la sala de cocina y la suya', () => {
    expect(roomsFor({ id: 'u1', permissions: [...DEFAULT_ROLE_PERMISSIONS.KITCHEN] })).toEqual([
      'user:u1',
      'kitchen',
    ]);
  });

  it('el mesero no recibe eventos de caja ni de administración', () => {
    const rooms = roomsFor({ id: 'u2', permissions: [...DEFAULT_ROLE_PERMISSIONS.WAITER] });
    expect(rooms).toContain('waiters');
    expect(rooms).not.toContain('cashier');
    expect(rooms).not.toContain('admin');
  });

  it('el administrador está en todas las salas', () => {
    expect(roomsFor({ id: 'a', permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN] })).toEqual([
      'user:a',
      'admin',
      'cashier',
      'waiters',
      'kitchen',
    ]);
  });
});
