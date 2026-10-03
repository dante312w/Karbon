import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ensureDatabase, migrate } from '../src/database/migrator.js';
import { recreateDatabase, runInBackend, testDatabaseUrl } from './integration/database.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const DATABASE_URL = testDatabaseUrl('karbon_migrator_test');

describe('migrador del servidor embebido', () => {
  it('crea la base, aplica todas las migraciones y es idempotente', async () => {
    await recreateDatabase(DATABASE_URL);
    await ensureDatabase(DATABASE_URL);
    const first = await migrate(DATABASE_URL, MIGRATIONS_DIR);
    expect(first.applied.length).toBeGreaterThan(0);
    expect(first.alreadyApplied).toBe(0);

    const second = await migrate(DATABASE_URL, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toBe(first.applied.length);
  });

  it('es compatible con Prisma: `prisma migrate deploy` no encuentra nada pendiente', () => {
    // Si el formato de _prisma_migrations difiriera, Prisma intentaría reaplicar y fallaría.
    expect(() => {
      runInBackend('npx prisma migrate deploy', DATABASE_URL);
    }).not.toThrow();
  });
});
