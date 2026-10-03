import 'dotenv/config';
import { BusinessMode } from '@karbon/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { seedAdmin, seedBaseConfiguration, seedDemoData, seedRoles } from './seed-steps.js';

/**
 * Seed idempotente de línea de comandos (desarrollo, Docker y CI).
 * - Siempre: roles de sistema, configuración base, impuestos y numeración.
 * - Administrador: si hay SEED_ADMIN_PASSWORD. En producción sin clave se omite y la instalación
 *   queda lista para el asistente de primer arranque (sin claves por defecto).
 * - Demo: SEED_DEMO_DATA=true y catálogo vacío. SEED_BUSINESS_MODE=RESTAURANT | BAR.
 */

const EXAMPLE_ADMIN_PASSWORD = 'Admin123*';

function readOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const rawMode = (process.env.SEED_BUSINESS_MODE ?? BusinessMode.RESTAURANT).toUpperCase();
  if (rawMode !== BusinessMode.RESTAURANT && rawMode !== BusinessMode.BAR) {
    throw new Error('SEED_BUSINESS_MODE debe ser RESTAURANT o BAR');
  }
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? null : EXAMPLE_ADMIN_PASSWORD);
  if (
    isProduction &&
    adminPassword !== null &&
    (adminPassword.length < 10 || adminPassword === EXAMPLE_ADMIN_PASSWORD)
  ) {
    throw new Error(
      'En producción SEED_ADMIN_PASSWORD debe tener mínimo 10 caracteres y no ser la de ejemplo.',
    );
  }
  return {
    mode: rawMode,
    adminUsername: process.env.SEED_ADMIN_USERNAME ?? 'admin',
    adminPassword,
    demoData: (process.env.SEED_DEMO_DATA ?? String(!isProduction)).toLowerCase() === 'true',
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL no está definida');

  const options = readOptions();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.restaurantSettings.findUnique({ where: { id: 1 } });
        const mode = existing?.businessMode ?? options.mode;
        const roles = await seedRoles(tx, mode);
        await seedBaseConfiguration(tx, mode, 'Mi Restaurante');

        if (!options.adminPassword) {
          console.info(
            'Seed: datos base listos; el administrador se crea en el asistente de primer arranque.',
          );
          return;
        }
        const adminId = await seedAdmin(tx, roles, {
          name: 'Administrador',
          username: options.adminUsername,
          password: options.adminPassword,
        });
        const loaded = options.demoData && (await seedDemoData(tx, mode, roles, adminId));
        console.info(
          loaded
            ? `Seed: datos base y de demostración (${mode}) cargados.`
            : 'Seed: datos base sincronizados (demo omitida: desactivada o catálogo existente).',
        );
      },
      { timeout: 120_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
