import type { StaffCallDto } from '@karbon/types';
import { iso, isoOrNull, timestamps } from '../../common/mapping.js';
import type { Prisma } from '../../generated/prisma/client.js';

const STAFF = { select: { id: true, name: true } } as const;

export const STAFF_CALL_INCLUDE = {
  table: STAFF,
  order: { select: { number: true } },
  targetUser: STAFF,
  createdBy: { select: { id: true, name: true, role: { select: { name: true } } } },
  acknowledgedBy: STAFF,
  closedBy: STAFF,
} satisfies Prisma.StaffCallInclude;

export type StaffCallRow = Prisma.StaffCallGetPayload<{ include: typeof STAFF_CALL_INCLUDE }>;

export function toStaffCallDto(call: StaffCallRow): StaffCallDto {
  return {
    id: call.id,
    target: call.target,
    reason: call.reason,
    status: call.status,
    message: call.message,
    table: call.table,
    orderId: call.orderId,
    orderNumber: call.order?.number ?? null,
    targetUser: call.targetUser,
    createdBy: {
      id: call.createdBy.id,
      name: call.createdBy.name,
      roleName: call.createdBy.role.name,
    },
    acknowledgedBy: call.acknowledgedBy,
    closedBy: call.closedBy,
    callCount: call.callCount,
    lastCalledAt: iso(call.lastCalledAt),
    acknowledgedAt: isoOrNull(call.acknowledgedAt),
    closedAt: isoOrNull(call.closedAt),
    ...timestamps(call),
  };
}
