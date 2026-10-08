import type { IsoDateTime, Timestamps, Uuid } from '../common.js';
import type { StaffCallReason, StaffCallStatus, StaffCallTarget } from '../enums.js';

interface StaffRef {
  id: Uuid;
  name: string;
}

/**
 * Llamado interno entre áreas: "Mesa 12 necesita atención" (al mesero) o "Necesito cobrar la
 * Mesa 5" (a caja). Se guarda en la base: sobrevive a reconexiones y deja registro de quién
 * llamó, quién respondió y cuándo.
 */
export interface StaffCallDto extends Timestamps {
  id: Uuid;
  target: StaffCallTarget;
  reason: StaffCallReason;
  status: StaffCallStatus;
  /** Detalle libre opcional ("trae la máquina de datáfono"). */
  message: string | null;
  table: StaffRef | null;
  orderId: Uuid | null;
  orderNumber: number | null;
  /**
   * Mesero elegido por quien llama; `null` = a todos los meseros o a caja. Si se escaló
   * (`escalatedAt`), lo ven y atienden todos los meseros, pero se conserva a quién iba.
   */
  targetUser: StaffRef | null;
  /** Quién llamó y su rol ("Cocina", "Cajero"), para que quien recibe sepa adónde ir. */
  createdBy: StaffRef & { roleName: string };
  acknowledgedBy: StaffRef | null;
  closedBy: StaffRef | null;
  /** Veces que se insistió con el mismo llamado (1 = solo el original). */
  callCount: number;
  lastCalledAt: IsoDateTime;
  acknowledgedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
  /** Primera vez que el aviso apareció en el equipo de quien lo atiende ("vista"). */
  seenAt: IsoDateTime | null;
  seenBy: StaffRef | null;
  /** Nadie respondió a tiempo y el llamado pasó a todos los meseros. */
  escalatedAt: IsoDateTime | null;
}

/** Mesero al que se puede llamar: activo y, si tiene la app abierta, conectado. */
export interface StaffCallRecipientDto {
  id: Uuid;
  name: string;
  roleName: string;
  /** Tiene un equipo conectado ahora (el aviso le llega al instante). */
  online: boolean;
}
