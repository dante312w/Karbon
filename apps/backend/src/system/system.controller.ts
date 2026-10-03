import { Controller, Get, Header, HttpStatus, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CertificateInfoDto, HealthResponse, ServerInfo } from '@karbon/types';
import type { Response } from 'express';
import { APP_NAME, APP_VERSION } from '../app-info.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { Public } from '../common/auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lanUrls } from './lan-addresses.js';
import { TlsService } from './tls/tls.service.js';

@ApiTags('Sistema')
@Public()
@Controller()
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly tls: TlsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Estado del servidor y de la base de datos' })
  @ApiOkResponse({ description: 'Servidor y base de datos operativos' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde' })
  async health(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const databaseUp = await this.prisma.isDatabaseUp();
    if (!databaseUp) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: databaseUp ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      database: databaseUp ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('system/info')
  @ApiOperation({ summary: 'Nombre, versión y direcciones del servidor y de las apps en la LAN' })
  async info(): Promise<ServerInfo> {
    const lan = lanUrls(this.config.get('PORT', { infer: true }));
    // Si este servidor publica las apps, los celulares entran por HTTPS cuando está activo.
    const certificate = await this.tls.info();
    const served = certificate.httpsEnabled ? certificate.httpsUrls : lan;
    const at = (urls: string[], path: string): string[] => urls.map((url) => `${url}${path}`);
    // En desarrollo cada app la sirve Vite en su propio puerto, con la misma IP de la red local.
    const dev = (port: number, path: string): string[] => (port > 0 ? at(lanUrls(port), path) : []);
    const get = <K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] =>
      this.config.get(key, { infer: true });
    return {
      name: APP_NAME,
      version: APP_VERSION,
      lanUrls: lan,
      waiterAppUrls: get('CLIENT_MOBILE_DIR') ? at(served, '/') : dev(get('DEV_MOBILE_PORT'), '/'),
      kdsUrls: get('CLIENT_DESKTOP_DIR')
        ? at(served, '/app/#/kds')
        : dev(get('DEV_DESKTOP_PORT'), '/#/kds'),
    };
  }

  @Get('system/certificate')
  @ApiOperation({ summary: 'Estado de HTTPS y huella de la CA local' })
  certificate(): Promise<CertificateInfoDto> {
    return this.tls.info();
  }

  /** Certificado público de la CA para instalar en los celulares (nunca la clave privada). */
  @Get('system/ca.crt')
  @Header('Content-Type', 'application/x-x509-ca-cert')
  @Header('Content-Disposition', 'attachment; filename="karbon-ca.crt"')
  @ApiOperation({ summary: 'Descarga el certificado de la CA local' })
  async caCertificate(): Promise<string> {
    const pem = await this.tls.caCertificatePem();
    if (!pem) throw new NotFoundException('HTTPS no está habilitado en este servidor');
    return pem;
  }
}
