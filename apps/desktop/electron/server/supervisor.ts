import { mkdir } from 'node:fs/promises';
import type { ServerInfo } from '@karbon/types';
import type { ServerStatus } from '../../shared/bridge';
import { BackendProcess } from './backend';
import { loadServerConfig, type ServerConfig } from './config';
import { resolveServerPaths, type ServerPaths } from './paths';
import { EmbeddedPostgres } from './postgres';

const HEALTH_TIMEOUT_MS = 120_000;

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      // Aún arrancando.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('El servidor no respondió a tiempo. Revisa logs/server.log.');
}

/**
 * Orquesta el servidor local de la instalación de escritorio: PostgreSQL embebido →
 * migraciones (las aplica el backend al arrancar) → backend → verificación de salud. La caja,
 * los celulares y las tablets del KDS se conectan a este servidor.
 */
export class ServerSupervisor {
  readonly paths: ServerPaths = resolveServerPaths();
  private config: ServerConfig | null = null;
  private postgres: EmbeddedPostgres | null = null;
  private readonly backend = new BackendProcess(this.paths, (message) => {
    this.update({ state: 'error', message, waiterAppUrls: [] });
  });
  private current: ServerStatus = {
    state: 'starting',
    message: 'Preparando el servidor…',
    waiterAppUrls: [],
  };
  private readonly listeners = new Set<(status: ServerStatus) => void>();

  get status(): ServerStatus {
    return this.current;
  }

  /** Puertos y secretos: se leen antes de abrir la ventana para conocer la URL del servidor. */
  async prepare(): Promise<ServerConfig> {
    await mkdir(this.paths.logsDir, { recursive: true });
    this.config ??= await loadServerConfig(this.paths.configFile);
    return this.config;
  }

  get serverUrl(): string {
    return `http://127.0.0.1:${String(this.config?.httpPort ?? 3000)}`;
  }

  onChange(listener: (status: ServerStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    try {
      const config = await this.prepare();
      this.update({ state: 'starting', message: 'Iniciando la base de datos…', waiterAppUrls: [] });
      this.postgres = new EmbeddedPostgres(this.paths, config);
      await this.postgres.ensureCluster();
      await this.postgres.start();

      this.update({ state: 'starting', message: 'Iniciando el servidor…', waiterAppUrls: [] });
      await mkdir(this.paths.dataDir, { recursive: true });
      await this.backend.start({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: String(config.httpPort),
        HTTPS_PORT: String(config.httpsPort),
        DATABASE_URL: this.postgres.databaseUrl,
        JWT_SECRET: config.jwtSecret,
        DATA_DIR: this.paths.dataDir,
        MIGRATIONS_DIR: this.paths.migrationsDir,
        CLIENT_MOBILE_DIR: this.paths.mobileDir,
        CLIENT_DESKTOP_DIR: this.paths.desktopDir,
        PG_BIN_DIR: this.paths.pgToolsDir,
        SWAGGER_ENABLED: 'false',
        LOG_LEVEL: 'log',
        KARBON_PARENT_PID: String(process.pid),
      });
      await waitForHealth(this.serverUrl, HEALTH_TIMEOUT_MS);
      const info = (await fetch(`${this.serverUrl}/api/v1/system/info`).then((response) =>
        response.json(),
      )) as ServerInfo;
      this.update({ state: 'running', message: null, waiterAppUrls: info.waiterAppUrls });
    } catch (error) {
      this.update({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
        waiterAppUrls: [],
      });
    }
  }

  async stop(): Promise<void> {
    await this.backend.stop();
    await this.postgres?.stop();
  }

  private update(status: ServerStatus): void {
    this.current = status;
    for (const listener of this.listeners) listener(status);
  }
}
