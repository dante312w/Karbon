import { Permission, SocketRoom, userRoom } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';

const ROOM_BY_PERMISSION: readonly (readonly [Permission, SocketRoom])[] = [
  [Permission.SETTINGS_READ, SocketRoom.ADMIN],
  [Permission.CASH_READ, SocketRoom.CASHIER],
  [Permission.ORDERS_CREATE, SocketRoom.WAITERS],
  [Permission.KITCHEN_READ, SocketRoom.KITCHEN],
];

/** Salas de un socket según los permisos del usuario: el cliente nunca elige. */
export function roomsFor(user: Pick<AuthenticatedUser, 'id' | 'permissions'>): string[] {
  return [
    userRoom(user.id),
    ...ROOM_BY_PERMISSION.filter(([permission]) => user.permissions.includes(permission)).map(
      ([, room]) => room,
    ),
  ];
}
