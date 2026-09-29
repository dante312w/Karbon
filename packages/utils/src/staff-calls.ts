import {
  Permission,
  type StaffCallDto,
  StaffCallReason,
  StaffCallStatus,
  StaffCallTarget,
  type Uuid,
} from '@karbon/types';

/**
 * Reglas de los llamados internos, compartidas por el servidor (que las exige) y por caja,
 * cocina y meseros (que las usan para mostrar y avisar). Un solo lugar para no duplicarlas.
 */

/** Motivos que admite cada destino; el servidor rechaza combinaciones cruzadas. */
export const STAFF_CALL_REASONS: Readonly<Record<StaffCallTarget, readonly StaffCallReason[]>> = {
  [StaffCallTarget.WAITER]: [StaffCallReason.TABLE_ATTENTION, StaffCallReason.COME_OVER],
  [StaffCallTarget.CASHIER]: [
    StaffCallReason.CHARGE_TABLE,
    StaffCallReason.ACCOUNT_HELP,
    StaffCallReason.CUSTOMER_ATTENTION,
  ],
};

/** Motivos que solo tienen sentido con una mesa o un pedido. */
export const STAFF_CALL_NEEDS_PLACE: ReadonlySet<StaffCallReason> = new Set([
  StaffCallReason.TABLE_ATTENTION,
  StaffCallReason.CHARGE_TABLE,
]);

/** Quién puede llamar a cada destino. */
export const STAFF_CALL_CREATE_PERMISSION: Readonly<Record<StaffCallTarget, Permission>> = {
  [StaffCallTarget.WAITER]: Permission.CALLS_WAITER,
  [StaffCallTarget.CASHIER]: Permission.CALLS_CASHIER,
};

/** Quién atiende cada destino: quienes entregan en la mesa o quienes cobran. */
export const STAFF_CALL_ANSWER_PERMISSION: Readonly<Record<StaffCallTarget, Permission>> = {
  [StaffCallTarget.WAITER]: Permission.ORDERS_DELIVER,
  [StaffCallTarget.CASHIER]: Permission.PAYMENTS_CREATE,
};

/** Tocar dos veces seguidas no vuelve a sonar: insistir cuenta después de este tiempo. */
export const STAFF_CALL_INSIST_COOLDOWN_MS = 10_000;

/** Motivo visto por quien llama (opciones del selector). */
export const STAFF_CALL_REASON_LABEL: Readonly<Record<StaffCallReason, string>> = {
  TABLE_ATTENTION: 'La mesa necesita atención',
  COME_OVER: 'Que venga un momento',
  CHARGE_TABLE: 'Necesito cobrar una mesa',
  ACCOUNT_HELP: 'Necesito ayuda con una cuenta',
  CUSTOMER_ATTENTION: 'Un cliente necesita a caja',
};

type CallStatus = Pick<StaffCallDto, 'status'>;

export function isStaffCallOpen(call: CallStatus): boolean {
  return call.status === StaffCallStatus.PENDING || call.status === StaffCallStatus.ACKNOWLEDGED;
}

export function canCreateStaffCall(
  target: StaffCallTarget,
  permissions: readonly Permission[],
): boolean {
  return permissions.includes(STAFF_CALL_CREATE_PERMISSION[target]);
}

export function canAnswerStaffCall(
  target: StaffCallTarget,
  permissions: readonly Permission[],
): boolean {
  return permissions.includes(STAFF_CALL_ANSWER_PERMISSION[target]);
}

/** Los dirigidos a otro mesero se muestran en su equipo sin sonar en el mío. */
export function isStaffCallForMe(call: Pick<StaffCallDto, 'targetUser'>, userId: Uuid): boolean {
  return call.targetUser === null || call.targetUser.id === userId;
}

/** Primero lo que nadie ha tomado; dentro de cada grupo, lo más antiguo arriba. */
export function sortStaffCalls<T extends Pick<StaffCallDto, 'status' | 'createdAt'>>(
  calls: readonly T[],
): T[] {
  const rank = (call: T): number => (call.status === StaffCallStatus.PENDING ? 0 : 1);
  return [...calls].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

/**
 * Aplica un llamado recibido (evento o respuesta del servidor) a la lista de abiertos: lo
 * reemplaza, lo agrega o, si ya se cerró, lo quita.
 */
export function mergeStaffCall(
  calls: readonly StaffCallDto[] | undefined,
  call: StaffCallDto,
): StaffCallDto[] | undefined {
  if (!calls) return calls;
  const others = calls.filter((candidate) => candidate.id !== call.id);
  if (!isStaffCallOpen(call)) return others;
  const index = calls.findIndex((candidate) => candidate.id === call.id);
  if (index === -1) return [...others, call];
  // Un evento viejo que llega tarde no pisa uno más nuevo.
  const current = calls[index];
  if (current && Date.parse(current.updatedAt) > Date.parse(call.updatedAt)) return [...calls];
  return calls.map((candidate) => (candidate.id === call.id ? call : candidate));
}

/** Llamados abiertos que este equipo atiende (caja recibe los de caja; el celular, los del mesero). */
export function incomingStaffCalls(
  calls: readonly StaffCallDto[],
  receive: StaffCallTarget,
  user: { id: Uuid; permissions: readonly Permission[] },
): StaffCallDto[] {
  if (!canAnswerStaffCall(receive, user.permissions)) return [];
  return sortStaffCalls(
    calls.filter(
      (call) => call.target === receive && isStaffCallOpen(call) && call.createdBy.id !== user.id,
    ),
  );
}

/** Llamados abiertos que hizo este usuario, para ver si ya los vieron. */
export function outgoingStaffCalls(calls: readonly StaffCallDto[], userId: Uuid): StaffCallDto[] {
  return sortStaffCalls(
    calls.filter((call) => isStaffCallOpen(call) && call.createdBy.id === userId),
  );
}

/** Mesa (o pedido sin mesa) del llamado: "Mesa 12", "Pedido #45". */
export function staffCallPlace(call: Pick<StaffCallDto, 'table' | 'orderNumber'>): string | null {
  if (call.table) return call.table.name;
  return call.orderNumber === null ? null : `Pedido #${String(call.orderNumber)}`;
}

/** Texto principal del aviso, visto por quien lo recibe ("Mesa 12 necesita atención"). */
export function staffCallTitle(
  call: Pick<StaffCallDto, 'reason' | 'table' | 'orderNumber' | 'createdBy'>,
): string {
  const place = staffCallPlace(call);
  switch (call.reason) {
    case StaffCallReason.TABLE_ATTENTION:
      return `${place ?? 'Una mesa'} necesita atención`;
    case StaffCallReason.COME_OVER:
      return `${call.createdBy.name} te llama${place ? ` · ${place}` : ''}`;
    case StaffCallReason.CHARGE_TABLE:
      return `Cobrar ${place ?? 'una cuenta'}`;
    case StaffCallReason.ACCOUNT_HELP:
      return `Ayuda con ${place ?? 'una cuenta'}`;
    case StaffCallReason.CUSTOMER_ATTENTION:
      return `Un cliente necesita a caja${place ? ` · ${place}` : ''}`;
  }
}

/** Estado visto por quien llamó y por los demás ("Va Laura", "Insistió 3 veces"). */
export function staffCallStatusText(
  call: Pick<StaffCallDto, 'status' | 'callCount' | 'acknowledgedBy' | 'closedBy'>,
): string {
  switch (call.status) {
    case StaffCallStatus.PENDING:
      return call.callCount > 1
        ? `Sin respuesta · ${String(call.callCount)} avisos`
        : 'Sin respuesta';
    case StaffCallStatus.ACKNOWLEDGED:
      return `Va ${call.acknowledgedBy?.name ?? 'alguien'}`;
    case StaffCallStatus.RESOLVED:
      return call.closedBy ? `Atendido por ${call.closedBy.name}` : 'Atendido';
    case StaffCallStatus.CANCELLED:
      return 'Cancelado';
  }
}
