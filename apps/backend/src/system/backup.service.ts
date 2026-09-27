import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { type BackupDto, ErrorCode } from '@karbon/types';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DomainError, notFound } from '../common/errors/domain-error.js';
import { StorageService } from '../common/storage/storage.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DomainEventsService } from '../modules/realtime/domain-events.service.js';
import { SettingsService } from '../modules/settings/settings.service.js';
import { backupFileName, parseBackupFileName, pgEnvironment } from './backup-files.js';

const run = promisify(execFile);
const KEEP_LATEST = 30;
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Respaldos con pg_dump (formato custom, comprimido) en DATA_DIR/backups: cada noche, al cerrar
 * caja y a pedido. Restaurar guarda antes un respaldo del estado actual.
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly directory: string;
  /** Una operación a la vez: dos pg_dump simultáneos solo duplican carga. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly domainEvents: DomainEventsService,
    private readonly settings: SettingsService,
    storage: StorageService,
  ) {
    this.directory = storage.path('backups');
  }

  onModuleInit(): void {
    this.domainEvents.on('cash.closed', async () => {
      await this.create('CASH_CLOSE');
    });
  }

  @Cron('0 3 * * *')
  async scheduled(): Promise<void> {
    try {
      await this.create('SCHEDULED');
    } catch (error) {
      this.logger.error(
        `Respaldo nocturno fallido: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(): Promise<BackupDto[]> {
    await mkdir(this.directory, { recursive: true });
    const backups: BackupDto[] = [];
    for (const fileName of await readdir(this.directory)) {
      const parsed = parseBackupFileName(fileName);
      if (!parsed) continue;
      const { size } = await stat(join(this.directory, fileName));
      backups.push({
        fileName,
        sizeBytes: size,
        createdAt: parsed.createdAt.toISOString(),
        reason: parsed.reason,
      });
    }
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(reason: BackupDto['reason']): Promise<BackupDto> {
    return this.exclusive(() => this.dump(reason));
  }

  restore(fileName: string): Promise<void> {
    return this.exclusive(async () => {
      if (!parseBackupFileName(fileName)) throw notFound('El respaldo');
      const source = join(this.directory, fileName);
      await stat(source).catch(() => {
        throw notFound('El respaldo');
      });
      await this.dump('PRE_RESTORE');
      await this.tool('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--single-transaction',
        '--dbname',
        pgEnvironment(this.databaseUrl()).PGDATABASE ?? '',
        source,
      ]);
      this.settings.invalidate();
      this.logger.warn(`Base de datos restaurada desde ${fileName}`);
    });
  }

  private async dump(reason: BackupDto['reason']): Promise<BackupDto> {
    await mkdir(this.directory, { recursive: true });
    const createdAt = new Date();
    const fileName = backupFileName(reason, createdAt);
    const target = join(this.directory, fileName);
    await this.tool('pg_dump', ['--format=custom', '--no-owner', '--file', target]);
    const { size } = await stat(target);
    await this.prune();
    this.logger.log(`Respaldo ${fileName} (${String(Math.round(size / 1024))} KB)`);
    return { fileName, sizeBytes: size, createdAt: createdAt.toISOString(), reason };
  }

  private async prune(): Promise<void> {
    const backups = await this.list();
    for (const old of backups.slice(KEEP_LATEST)) {
      await rm(join(this.directory, old.fileName), { force: true });
    }
  }

  private async tool(name: 'pg_dump' | 'pg_restore', args: string[]): Promise<void> {
    const binDir = this.config.get('PG_BIN_DIR', { infer: true });
    const executable = `${name}${process.platform === 'win32' ? '.exe' : ''}`;
    try {
      await run(binDir ? join(binDir, executable) : executable, args, {
        env: { ...process.env, ...pgEnvironment(this.databaseUrl()) },
        timeout: TIMEOUT_MS,
        windowsHide: true,
      });
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      throw new DomainError(
        ErrorCode.BACKUP_UNAVAILABLE,
        missing
          ? `No se encontró ${name}. Configura PG_BIN_DIR con la carpeta bin de PostgreSQL.`
          : `${name} falló: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
