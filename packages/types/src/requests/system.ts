import type { IsoDateTime } from '../common.js';
import type { BusinessMode } from '../enums.js';

export interface SetupStatusDto {
  /** `true` en una instalación nueva: el escritorio muestra el asistente de primer arranque. */
  required: boolean;
  businessMode: BusinessMode;
  restaurantName: string;
}

export interface CompleteSetupRequest {
  restaurantName: string;
  businessMode: BusinessMode;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
  adminPin?: string | null;
  /** Carga el catálogo de demostración del modo elegido. */
  loadDemoData?: boolean;
}

export type LicenseState = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'INVALID';

export interface LicenseStatusDto {
  state: LicenseState;
  licensee: string | null;
  plan: string | null;
  maxTerminals: number | null;
  expiresAt: IsoDateTime | null;
  /** Días de prueba restantes cuando no hay licencia. */
  trialDaysLeft: number | null;
}

export interface ActivateLicenseRequest {
  licenseKey: string;
}

export interface BackupDto {
  fileName: string;
  sizeBytes: number;
  createdAt: IsoDateTime;
  reason: 'SCHEDULED' | 'CASH_CLOSE' | 'MANUAL' | 'PRE_RESTORE';
}

export interface CertificateInfoDto {
  /** `true` si el servidor atiende HTTPS con la CA local. */
  httpsEnabled: boolean;
  httpsUrls: string[];
  caFingerprint: string | null;
}
