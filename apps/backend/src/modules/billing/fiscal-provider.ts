import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, FiscalDocumentType, InvoiceStatus } from '@karbon/types';
import { DomainError } from '../../common/errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface FiscalDocumentInput {
  branchId: string;
  documentType: FiscalDocumentType;
  prefix: string;
  number: number;
  total: string;
  currency: string;
  issuedAt: Date;
  customerDocument: string | null;
  technicalKey: string | null;
}

export interface FiscalIssueResult {
  status: InvoiceStatus;
  fiscalCode: string | null;
  qrData: string | null;
  externalId: string | null;
  response: Prisma.InputJsonValue | null;
}

/**
 * Puerto de facturación: el núcleo emite documentos sin conocer al proveedor. Un proveedor de
 * facturación electrónica (DIAN u otro) se agrega implementando esta interfaz, sin tocar
 * pedidos, caja ni reportes.
 */
export interface FiscalProvider {
  readonly name: string;
  supports(documentType: FiscalDocumentType): boolean;
  issue(document: FiscalDocumentInput): Promise<FiscalIssueResult>;
}

/** Documentos internos (tiquete, factura A4, documento equivalente POS, nota crédito). */
@Injectable()
export class LocalFiscalProvider implements FiscalProvider {
  readonly name = 'local';

  supports(documentType: FiscalDocumentType): boolean {
    return documentType !== FiscalDocumentType.ELECTRONIC_INVOICE;
  }

  issue(document: FiscalDocumentInput): Promise<FiscalIssueResult> {
    return Promise.resolve({
      status: InvoiceStatus.ISSUED,
      fiscalCode: null,
      // Datos verificables impresos como QR: sucursal, número, total y fecha.
      qrData: [
        document.branchId,
        `${document.prefix}${document.number}`,
        document.total,
        document.issuedAt.toISOString(),
      ].join('|'),
      externalId: null,
      response: null,
    });
  }
}

/**
 * Punto de conexión para la facturación electrónica DIAN. Se activa en una versión futura
 * con las credenciales del proveedor tecnológico; mientras tanto informa que no está configurado.
 */
@Injectable()
export class ElectronicInvoiceProvider implements FiscalProvider {
  readonly name = 'dian';

  supports(documentType: FiscalDocumentType): boolean {
    return documentType === FiscalDocumentType.ELECTRONIC_INVOICE;
  }

  issue(): Promise<FiscalIssueResult> {
    return Promise.reject(
      new DomainError(
        ErrorCode.FISCAL_PROVIDER_NOT_CONFIGURED,
        'La facturación electrónica no está configurada en esta instalación',
        HttpStatus.NOT_IMPLEMENTED,
      ),
    );
  }
}

@Injectable()
export class FiscalProviderRegistry {
  private readonly providers: FiscalProvider[];

  constructor(local: LocalFiscalProvider, electronic: ElectronicInvoiceProvider) {
    this.providers = [local, electronic];
  }

  for(documentType: FiscalDocumentType): FiscalProvider {
    const provider = this.providers.find((candidate) => candidate.supports(documentType));
    if (!provider) {
      throw new DomainError(
        ErrorCode.FISCAL_PROVIDER_NOT_CONFIGURED,
        'Tipo de documento sin proveedor',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return provider;
  }
}
