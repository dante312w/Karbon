import {
  DEFAULT_ROLE_PERMISSIONS,
  type StaffCallDto,
  StaffCallReason,
  StaffCallStatus,
  StaffCallTarget,
} from '@karbon/types';
import { describe, expect, it } from 'vitest';
import {
  canAnswerStaffCall,
  canCreateStaffCall,
  incomingStaffCalls,
  isStaffCallForMe,
  mergeStaffCall,
  outgoingStaffCalls,
  STAFF_CALL_REASONS,
  staffCallStatusText,
  staffCallTitle,
} from './staff-calls.js';

let sequence = 0;
const call = (overrides: Partial<StaffCallDto> = {}): StaffCallDto => {
  sequence += 1;
  return {
    id: `c${String(sequence)}`,
    target: StaffCallTarget.WAITER,
    reason: StaffCallReason.TABLE_ATTENTION,
    status: StaffCallStatus.PENDING,
    message: null,
    table: { id: 't12', name: 'Mesa 12' },
    orderId: 'o1',
    orderNumber: 45,
    targetUser: { id: 'laura', name: 'Laura' },
    createdBy: { id: 'cocina', name: 'Cocina', roleName: 'Cocina' },
    acknowledgedBy: null,
    closedBy: null,
    callCount: 1,
    lastCalledAt: `2026-09-29T12:0${String(sequence % 10)}:00.000Z`,
    acknowledgedAt: null,
    closedAt: null,
    createdAt: `2026-09-29T12:0${String(sequence % 10)}:00.000Z`,
    updatedAt: `2026-09-29T12:0${String(sequence % 10)}:00.000Z`,
    ...overrides,
  };
};

const waiter = { id: 'laura', permissions: [...DEFAULT_ROLE_PERMISSIONS.WAITER] };
const cashier = { id: 'camila', permissions: [...DEFAULT_ROLE_PERMISSIONS.CASHIER] };

describe('llamados internos', () => {
  it('cada rol llama y atiende lo suyo', () => {
    expect(canCreateStaffCall(StaffCallTarget.CASHIER, waiter.permissions)).toBe(true);
    expect(canCreateStaffCall(StaffCallTarget.WAITER, waiter.permissions)).toBe(false);
    expect(canCreateStaffCall(StaffCallTarget.WAITER, DEFAULT_ROLE_PERMISSIONS.KITCHEN)).toBe(true);
    expect(canAnswerStaffCall(StaffCallTarget.CASHIER, cashier.permissions)).toBe(true);
    expect(canAnswerStaffCall(StaffCallTarget.CASHIER, waiter.permissions)).toBe(false);
    expect(canAnswerStaffCall(StaffCallTarget.WAITER, DEFAULT_ROLE_PERMISSIONS.KITCHEN)).toBe(
      false,
    );
  });

  it('los motivos no se cruzan entre destinos', () => {
    const waiterReasons = new Set(STAFF_CALL_REASONS.WAITER);
    expect(STAFF_CALL_REASONS.CASHIER.some((reason) => waiterReasons.has(reason))).toBe(false);
  });

  it('el celular recibe los llamados abiertos al mesero: primero los que nadie tomó', () => {
    const taken = call({
      status: StaffCallStatus.ACKNOWLEDGED,
      acknowledgedBy: { id: 'andres', name: 'Andrés' },
    });
    const pending = call();
    const closed = call({ status: StaffCallStatus.RESOLVED });
    const toCashier = call({
      target: StaffCallTarget.CASHIER,
      reason: StaffCallReason.ACCOUNT_HELP,
    });
    expect(
      incomingStaffCalls([taken, pending, closed, toCashier], StaffCallTarget.WAITER, waiter).map(
        (item) => item.id,
      ),
    ).toEqual([pending.id, taken.id]);
    // Caja no atiende al mesero aunque tenga el permiso de entregar: su equipo recibe los de caja.
    expect(incomingStaffCalls([toCashier], StaffCallTarget.CASHIER, cashier)).toEqual([toCashier]);
    expect(incomingStaffCalls([toCashier], StaffCallTarget.CASHIER, waiter)).toEqual([]);
  });

  it('un llamado propio no llega como entrante, pero se sigue en los salientes', () => {
    const mine = call({
      target: StaffCallTarget.CASHIER,
      reason: StaffCallReason.CHARGE_TABLE,
      createdBy: { id: 'laura', name: 'Laura', roleName: 'Mesero' },
      targetUser: null,
    });
    expect(
      incomingStaffCalls([mine], StaffCallTarget.CASHIER, {
        ...waiter,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
      }),
    ).toEqual([]);
    expect(outgoingStaffCalls([mine], 'laura')).toEqual([mine]);
  });

  it('suena para el mesero del pedido o para todos si no tiene dueño', () => {
    expect(isStaffCallForMe(call(), 'laura')).toBe(true);
    expect(isStaffCallForMe(call(), 'andres')).toBe(false);
    expect(isStaffCallForMe(call({ targetUser: null }), 'andres')).toBe(true);
  });

  it('describe el llamado para quien lo recibe', () => {
    expect(staffCallTitle(call())).toBe('Mesa 12 necesita atención');
    expect(staffCallTitle(call({ reason: StaffCallReason.COME_OVER }))).toBe(
      'Cocina te llama · Mesa 12',
    );
    expect(
      staffCallTitle(call({ reason: StaffCallReason.CHARGE_TABLE, table: null, orderNumber: 45 })),
    ).toBe('Cobrar Pedido #45');
    expect(
      staffCallTitle(
        call({ reason: StaffCallReason.CUSTOMER_ATTENTION, table: null, orderNumber: null }),
      ),
    ).toBe('Un cliente necesita a caja');
  });

  it('cuenta quién va y cuántas veces se insistió', () => {
    expect(staffCallStatusText(call({ callCount: 3 }))).toBe('Sin respuesta · 3 avisos');
    expect(
      staffCallStatusText(
        call({ status: StaffCallStatus.ACKNOWLEDGED, acknowledgedBy: { id: 'l', name: 'Laura' } }),
      ),
    ).toBe('Va Laura');
    expect(staffCallStatusText(call({ status: StaffCallStatus.RESOLVED }))).toBe('Atendido');
  });
});

describe('mergeStaffCall', () => {
  it('agrega, reemplaza y quita los cerrados', () => {
    const first = call();
    const second = call();
    expect(mergeStaffCall([first], second)).toEqual([first, second]);
    const taken = {
      ...first,
      status: StaffCallStatus.ACKNOWLEDGED,
      updatedAt: '2026-09-29T13:00:00.000Z',
    };
    expect(mergeStaffCall([first, second], taken)).toEqual([taken, second]);
    expect(
      mergeStaffCall([first, second], { ...second, status: StaffCallStatus.RESOLVED }),
    ).toEqual([first]);
  });

  it('no aplica un evento más viejo que el que ya tiene', () => {
    const fresh = call({ updatedAt: '2026-09-29T13:00:00.000Z', callCount: 2 });
    const stale = { ...fresh, updatedAt: '2026-09-29T12:59:00.000Z', callCount: 1 };
    expect(mergeStaffCall([fresh], stale)).toEqual([fresh]);
  });

  it('sin lista en caché no inventa una', () => {
    expect(mergeStaffCall(undefined, call())).toBeUndefined();
  });
});
