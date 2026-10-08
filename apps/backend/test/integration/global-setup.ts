import { recreateDatabase, runInBackend, TEST_DATABASE_URL } from './database.js';

/**
 * Base de datos limpia para cada corrida: se recrea, se aplican las migraciones versionadas
 * (las mismas de producción) y se carga el seed de demostración.
 */
export default async function setup(): Promise<void> {
  await recreateDatabase(TEST_DATABASE_URL);
  runInBackend('npx prisma migrate deploy', TEST_DATABASE_URL);
  runInBackend('npx tsx src/database/seed/seed.ts', TEST_DATABASE_URL, {
    SEED_ADMIN_PASSWORD: 'Admin123*',
    SEED_DEMO_DATA: 'true',
    SEED_BUSINESS_MODE: 'RESTAURANT',
  });
}
