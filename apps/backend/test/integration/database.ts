import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://karbon:karbon@localhost:55432/karbon_test';

const backendDir = fileURLToPath(new URL('../../', import.meta.url));

/** Misma conexión que TEST_DATABASE_URL pero con otra base (también terminada en _test). */
export function testDatabaseUrl(database: string): string {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Borra y crea la base; por seguridad solo acepta nombres terminados en _test. */
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error('Por seguridad, la base de pruebas debe terminar en _test');
  }
  parsed.pathname = '/postgres';
  parsed.search = '';
  const client = new pg.Client({ connectionString: parsed.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database}"`);
  await client.end();
}

/** Ejecuta un comando del backend (migraciones, seed) contra la base indicada. */
export function runInBackend(
  command: string,
  databaseUrl: string,
  env: Record<string, string> = {},
): void {
  execSync(command, {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, ...env },
    stdio: 'pipe',
  });
}
