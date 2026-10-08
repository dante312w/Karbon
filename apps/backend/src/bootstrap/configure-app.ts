import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { isAbsolute, resolve, sep } from 'node:path';
import { APP_NAME, APP_VERSION } from '../app-info.js';
import { ApiExceptionFilter } from '../common/errors/api-exception.filter.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { buildCorsOptions } from './cors.js';
import { LanSocketIoAdapter } from './socket-io.adapter.js';

export const API_PREFIX = 'api';
export const API_DOCS_PATH = `${API_PREFIX}/docs`;
const REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * Configuración HTTP compartida por `main.ts` y las pruebas e2e, para que las pruebas
 * ejerciten exactamente la misma cadena de seguridad que producción.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });

  app.set('trust proxy', false);
  app.use(
    (
      request: { headers: Record<string, unknown> },
      response: { setHeader: (k: string, v: string) => void },
      next: () => void,
    ) => {
      const incoming = request.headers['x-request-id'];
      const requestId =
        typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      request.headers['x-request-id'] = requestId;
      response.setHeader('X-Request-Id', requestId);
      next();
    },
  );
  app.use(
    helmet({
      // La PWA y el renderer servidos por este backend cargan sus propios recursos.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  // Imágenes en data URL (logo, productos) de hasta 512 KB.
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors(buildCorsOptions(corsOrigins));
  app.useWebSocketAdapter(new LanSocketIoAdapter(app, corsOrigins));
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  serveClients(app, config);

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(`${APP_NAME} API`)
        .setDescription(
          'API REST del servidor local. Los eventos en tiempo real se documentan en docs/API.md.',
        )
        .setVersion(APP_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(API_DOCS_PATH, app, document);
  }
}

/** Archivos con hash en el nombre (`/assets/`) se guardan en caché un año; el resto se revalida. */
function cacheHeaders(response: ServerResponse, filePath: string): void {
  const immutable = filePath.includes(`${sep}assets${sep}`);
  response.setHeader(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
}

/**
 * La PWA de meseros se sirve en `/` y el renderer (KDS en tablets) en `/app/`: los celulares
 * solo necesitan la dirección del servidor. Ambas apps usan rutas con # (sin reescrituras).
 */
function serveClients(
  app: NestExpressApplication,
  config: ConfigService<EnvironmentVariables, true>,
): void {
  const absolute = (dir: string): string => (isAbsolute(dir) ? dir : resolve(process.cwd(), dir));
  const desktopDir = config.get('CLIENT_DESKTOP_DIR', { infer: true });
  const mobileDir = config.get('CLIENT_MOBILE_DIR', { infer: true });
  if (desktopDir)
    app.useStaticAssets(absolute(desktopDir), { prefix: '/app/', setHeaders: cacheHeaders });
  if (mobileDir)
    app.useStaticAssets(absolute(mobileDir), { prefix: '/', setHeaders: cacheHeaders });
}
