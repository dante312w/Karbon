import { execFile, spawn } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ServerConfig } from './config';
import type { ServerPaths } from './paths';

const run = promisify(execFile);
export const DATABASE_USER = 'karbon';

/**
 * PostgreSQL embebido: un clúster propio en userData, solo accesible desde este equipo
 * (127.0.0.1) y con clave aleatoria. Se controla con pg_ctl para apagarlo limpio al salir.
 */
export class EmbeddedPostgres {
  constructor(
    private readonly paths: ServerPaths,
    private readonly config: ServerConfig,
  ) {}

  private bin(name: string): string {
    return join(this.paths.pgBinDir, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  }

  get databaseUrl(): string {
    const password = encodeURIComponent(this.config.pgPassword);
    return `postgresql://${DATABASE_USER}:${password}@127.0.0.1:${String(this.config.pgPort)}/karbon`;
  }

  async ensureCluster(): Promise<void> {
    const initialized = await access(join(this.paths.pgDataDir, 'PG_VERSION')).then(
      () => true,
      () => false,
    );
    if (initialized) return;
    await rm(this.paths.pgDataDir, { recursive: true, force: true });
    await mkdir(this.paths.logsDir, { recursive: true });
    const passwordFile = join(this.paths.logsDir, `.initdb-${String(process.pid)}`);
    await writeFile(passwordFile, this.config.pgPassword, { mode: 0o600 });
    try {
      await run(
        this.bin('initdb'),
        [
          '--pgdata',
          this.paths.pgDataDir,
          '--username',
          DATABASE_USER,
          '--pwfile',
          passwordFile,
          '--auth',
          'scram-sha-256',
          '--encoding',
          'UTF8',
          '--locale',
          'C',
        ],
        { windowsHide: true, timeout: 120_000 },
      );
    } finally {
      await rm(passwordFile, { force: true });
    }
  }

  async start(): Promise<void> {
    if (await this.isRunning()) return;
    await mkdir(this.paths.logsDir, { recursive: true });
    // Sin tuberías: postgres hereda los descriptores de pg_ctl y execFile nunca vería el cierre.
    await runDetached(this.bin('pg_ctl'), [
      'start',
      '--pgdata',
      this.paths.pgDataDir,
      '--wait',
      '--timeout',
      '60',
      '--log',
      join(this.paths.logsDir, 'postgres.log'),
      '-o',
      `-p ${String(this.config.pgPort)} -c listen_addresses=127.0.0.1`,
    ]);
  }

  async stop(): Promise<void> {
    if (!(await this.isRunning())) return;
    await run(
      this.bin('pg_ctl'),
      ['stop', '--pgdata', this.paths.pgDataDir, '--mode', 'fast', '--wait', '--timeout', '30'],
      { windowsHide: true, timeout: 45_000 },
    );
  }

  private async isRunning(): Promise<boolean> {
    try {
      await run(this.bin('pg_ctl'), ['status', '--pgdata', this.paths.pgDataDir], {
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function runDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó con código ${String(code)}`));
    });
  });
}
