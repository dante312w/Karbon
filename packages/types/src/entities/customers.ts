import type { IsoDate, IsoDateTime, MinorUnits, Timestamps, Uuid } from '../common.js';
import type { IdentityDocumentType } from '../enums.js';

export interface CustomerDto extends Timestamps {
  id: Uuid;
  name: string;
  phone: string | null;
  email: string | null;
  documentType: IdentityDocumentType | null;
  documentNumber: string | null;
  birthday: IsoDate | null;
  address: string | null;
  notes: string | null;
  visitsCount: number;
  totalSpent: MinorUnits;
  lastVisitAt: IsoDateTime | null;
}
