import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createServer } from 'node:https';
import { AppModule } from './app.module.js';
import { API_DOCS_PATH, configureApp } from './bootstrap/configure-app.js';
import type { EnvironmentVariables, LogLevel } from './config/env.validation.js';
import { ensureDatabase, migrate } from './database/migrator.js';
import { TlsService } from './system/tls/tls.service.js';

const LOG_LEVELS_BY_THRESHOLD: Record<LogLevel, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

/** En la instalación de escritorio la base se crea y migra antes de levantar la app. */
async function runMigrations(logger: Logger): Promise<void> {
  const migrationsDir = process.env.MIGRATIONS_DIR;
  const databaseUrl = process.env.DATABASE_URL;
  if (!migrationsDir || !databaseUrl) return;
  await ensureDatabase(databaseUrl);
  const { applied, alreadyApplied } = await migrate(databaseUrl, migrationsDir);
  logger.log(`Migraciones: ${String(applied.length)} aplicadas, ${String(alreadyApplied)} al día`);
}

async function bootstrap(): Promise<void> {
  await runMigrations(new Logger('Migraciones'));
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  app.useLogger(LOG_LEVELS_BY_THRESHOLD[config.get('LOG_LEVEL', { infer: true })]);

  configureApp(app);

  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });
  const logger = new Logger('Bootstrap');
  try {
    await app.listen(port, host);
  } catch (error) {
    // Otro servidor con el puerto (la API de Docker o Karbon instalado) recibiría las llamadas
    // de las apps y de los celulares en lugar de este: se aborta con un mensaje claro.
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(
        `El puerto ${String(port)} ya está en uso por otro programa (¿la API de Docker o Karbon POS instalado?). Deténlo o cambia PORT.`,
      );
      app.flushLogs();
      process.exitCode = 1;
      await app.close();
      return;
    }
    throw error;
  }
  logger.log(`Servidor escuchando en http://${host}:${port}`);

  watchParent(app, logger);

  const httpsPort = config.get('HTTPS_PORT', { infer: true });
  if (httpsPort > 0) {
    await listenHttps(app, host, httpsPort);
    logger.log(`HTTPS con la CA local en el puerto ${String(httpsPort)}`);
  }
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Documentación de la API en http://localhost:${port}/${API_DOCS_PATH}`);
  }
}

/**
 * Instalación de escritorio: si la app que lanzó este servidor desaparece (cierre forzado,
 * corte de energía), el servidor se apaga en lugar de quedar huérfano ocupando el puerto.
 */
function watchParent(app: NestExpressApplication, logger: Logger): void {
  const parentPid = Number(process.env.KARBON_PARENT_PID);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;
  const timer = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      clearInterval(timer);
      logger.warn('La aplicación de escritorio se cerró: apagando el servidor');
      void app.close().finally(() => process.exit(0));
    }
  }, 3_000);
  timer.unref();
}

/**
 * El servidor HTTPS reenvía solicitudes y upgrades de WebSocket al servidor HTTP de Nest:
 * la misma app (API, Socket.io, PWA) atiende en ambos puertos. HTTP queda como respaldo para
 * celulares que aún no instalan la CA.
 */
async function listenHttps(app: NestExpressApplication, host: string, port: number): Promise<void> {
  const credentials = await app.get(TlsService).ensure();
  const httpServer = app.getHttpServer();
  const secure = createServer(credentials, (request, response) => {
    httpServer.emit('request', request, response);
  });
  secure.on('upgrade', (request, socket, head) => {
    httpServer.emit('upgrade', request, socket, head);
  });
  httpServer.on('close', () => {
    secure.close();
  });
  await new Promise<void>((resolveListen) => {
    secure.listen(port, host, resolveListen);
  });
}

await bootstrap();
