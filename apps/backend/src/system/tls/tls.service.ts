import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CertificateInfoDto } from '@karbon/types';
import * as x509 from '@peculiar/x509';
import { randomBytes, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StorageService } from '../../common/storage/storage.service.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { lanIPv4Addresses, lanUrls } from '../lan-addresses.js';
import { encodeNameConstraints, NAME_CONSTRAINTS_OID } from './name-constraints.js';

type CryptoKey = webcrypto.CryptoKey;

// El backend compila sin la librería DOM: el proveedor WebCrypto de Node es compatible.
x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0]);

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const CA_VALID_DAYS = 3650;
/** iOS rechaza certificados de servidor de más de 825 días; se renuevan antes de vencer. */
const SERVER_VALID_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;

export interface TlsCredentials {
  key: string;
  cert: string;
}

interface Authority {
  certificate: x509.X509Certificate;
  privateKey: CryptoKey;
}

function serialNumber(): string {
  // Positivo (bit alto en 0) y de 16 bytes, como exige RFC 5280.
  const bytes = randomBytes(16);
  bytes[0] = (bytes[0] ?? 0) & 0x7f;
  return bytes.toString('hex');
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return x509.PemConverter.encode(await webcrypto.subtle.exportKey('pkcs8', key), 'PRIVATE KEY');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return webcrypto.subtle.importKey('pkcs8', x509.PemConverter.decodeFirst(pem), ALGORITHM, true, [
    'sign',
  ]);
}

/**
 * CA local del restaurante y certificado del servidor para HTTPS en la LAN. La CA se crea
 * una vez (DATA_DIR/tls) y se instala en los celulares; el certificado del servidor se
 * vuelve a emitir solo si cambian las IPs del equipo o se acerca su vencimiento.
 */
@Injectable()
export class TlsService {
  private readonly logger = new Logger(TlsService.name);
  private readonly directory: string;
  private credentials: Promise<TlsCredentials> | null = null;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    storage: StorageService,
  ) {
    this.directory = storage.path('tls');
  }

  get enabled(): boolean {
    return this.config.get('HTTPS_PORT', { infer: true }) > 0;
  }

  ensure(): Promise<TlsCredentials> {
    this.credentials ??= this.prepare().catch((error: unknown) => {
      this.credentials = null;
      throw error;
    });
    return this.credentials;
  }

  async caCertificatePem(): Promise<string | null> {
    if (!this.enabled) return null;
    await this.ensure();
    return readFile(this.file('ca.crt'), 'utf8');
  }

  async info(): Promise<CertificateInfoDto> {
    if (!this.enabled) return { httpsEnabled: false, httpsUrls: [], caFingerprint: null };
    const ca = new x509.X509Certificate((await this.caCertificatePem()) ?? '');
    const thumbprint = Buffer.from(await ca.getThumbprint('SHA-256'))
      .toString('hex')
      .toUpperCase();
    return {
      httpsEnabled: true,
      httpsUrls: lanUrls(this.config.get('HTTPS_PORT', { infer: true }), 'https'),
      caFingerprint: thumbprint.match(/.{2}/g)?.join(':') ?? thumbprint,
    };
  }

  private file(name: string): string {
    return join(this.directory, name);
  }

  private async prepare(): Promise<TlsCredentials> {
    await mkdir(this.directory, { recursive: true });
    const authority = await this.loadOrCreateAuthority();
    const current = await this.loadServerCertificate();
    const addresses = lanIPv4Addresses();
    if (current && this.covers(current.certificate, authority.certificate, addresses)) {
      return current.credentials;
    }
    return this.issueServerCertificate(authority, addresses);
  }

  private async loadOrCreateAuthority(): Promise<Authority> {
    try {
      const [certPem, keyPem] = await Promise.all([
        readFile(this.file('ca.crt'), 'utf8'),
        readFile(this.file('ca.key'), 'utf8'),
      ]);
      return {
        certificate: new x509.X509Certificate(certPem),
        privateKey: await importPrivateKey(keyPem),
      };
    } catch {
      return this.createAuthority();
    }
  }

  private async createAuthority(): Promise<Authority> {
    const keys = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    const now = new Date();
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: serialNumber(),
      name: 'CN=Karbon POS - CA local del restaurante, O=Karbon POS',
      notBefore: now,
      notAfter: new Date(now.getTime() + CA_VALID_DAYS * DAY_MS),
      signingAlgorithm: ALGORITHM,
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
          true,
        ),
        new x509.Extension(NAME_CONSTRAINTS_OID, true, encodeNameConstraints()),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      ],
    });
    await Promise.all([
      writeFile(this.file('ca.crt'), certificate.toString('pem')),
      writeFile(this.file('ca.key'), await exportPrivateKey(keys.privateKey), { mode: 0o600 }),
    ]);
    this.logger.log('CA local creada: los celulares deben instalarla una vez para usar HTTPS');
    return { certificate, privateKey: keys.privateKey };
  }

  private async loadServerCertificate(): Promise<{
    certificate: x509.X509Certificate;
    credentials: TlsCredentials;
  } | null> {
    try {
      const [cert, key] = await Promise.all([
        readFile(this.file('server.crt'), 'utf8'),
        readFile(this.file('server.key'), 'utf8'),
      ]);
      return { certificate: new x509.X509Certificate(cert), credentials: { cert, key } };
    } catch {
      return null;
    }
  }

  private covers(
    certificate: x509.X509Certificate,
    authority: x509.X509Certificate,
    addresses: string[],
  ): boolean {
    if (certificate.issuer !== authority.subject) return false;
    if (certificate.notAfter.getTime() - Date.now() < RENEW_BEFORE_DAYS * DAY_MS) return false;
    const names =
      certificate.getExtension(x509.SubjectAlternativeNameExtension)?.names.toJSON() ?? [];
    const ips = new Set(names.filter((name) => name.type === 'ip').map((name) => name.value));
    return addresses.every((address) => ips.has(address));
  }

  private async issueServerCertificate(
    authority: Authority,
    addresses: string[],
  ): Promise<TlsCredentials> {
    const keys = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    const now = new Date();
    const certificate = await x509.X509CertificateGenerator.create({
      serialNumber: serialNumber(),
      subject: 'CN=Karbon POS',
      issuer: authority.certificate.subject,
      notBefore: new Date(now.getTime() - DAY_MS),
      notAfter: new Date(now.getTime() + SERVER_VALID_DAYS * DAY_MS),
      signingAlgorithm: ALGORITHM,
      publicKey: keys.publicKey,
      signingKey: authority.privateKey,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
          true,
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
        new x509.SubjectAlternativeNameExtension([
          { type: 'dns', value: 'localhost' },
          { type: 'ip', value: '127.0.0.1' },
          ...addresses.map((value) => ({ type: 'ip' as const, value })),
        ]),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
        await x509.AuthorityKeyIdentifierExtension.create(authority.certificate),
      ],
    });
    const credentials = {
      cert: certificate.toString('pem'),
      key: await exportPrivateKey(keys.privateKey),
    };
    await Promise.all([
      writeFile(this.file('server.crt'), credentials.cert),
      writeFile(this.file('server.key'), credentials.key, { mode: 0o600 }),
    ]);
    this.logger.log(`Certificado HTTPS emitido para ${addresses.join(', ') || 'localhost'}`);
    return credentials;
  }
}
