import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Aplica las migraciones versionadas de Prisma (prisma/migrations/*\/migration.sql) sin la CLI
 * de Prisma, para la instalación de escritorio. Registra cada una en `_prisma_migrations` con
 * el mismo formato que `prisma migrate deploy`, así ambas herramientas son intercambiables.
 */

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/** Lock consultivo de sesión: dos arranques simultáneos no aplican la misma migración. */
const MIGRATION_LOCK_KEY = 461_734_002;

export interface MigrationResult {
  applied: string[];
  alreadyApplied: number;
}

/** Crea la base si no existe (instalación nueva del servidor embebido). */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  url.pathname = '/postgres';
  url.search = '';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}" ENCODING 'UTF8'`);
    }
  } finally {
    await client.end();
  }
}

export async function migrate(
  databaseUrl: string,
  migrationsDir: string,
): Promise<MigrationResult> {
  const names = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    // Se libera al cerrar la conexión.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(MIGRATIONS_TABLE);
    const done = await client.query<{ migration_name: string; checksum: string }>(
      'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Map(done.rows.map((row) => [row.migration_name, row.checksum]));
    const result: MigrationResult = { applied: [], alreadyApplied: 0 };

    for (const name of names) {
      const sql = await readFile(join(migrationsDir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = applied.get(name);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `La migración ${name} cambió después de aplicarse; no se puede continuar`,
          );
        }
        result.alreadyApplied += 1;
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES ($1, $2, now(), $3, 1)`,
          [randomUUID(), checksum, name],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Falló la migración ${name}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      result.applied.push(name);
    }
    return result;
  } finally {
    await client.end();
  }
}
