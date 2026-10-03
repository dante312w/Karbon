import type { LoginResponse, SetupStatusDto } from '@karbon/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { recreateDatabase, runInBackend, testDatabaseUrl } from './integration/database.js';
import type { Harness } from './integration/harness.js';

/**
 * Instalación nueva: solo migraciones, sin seed. Es lo que ve el cliente al abrir el instalador
 * por primera vez; no debe existir ninguna clave por defecto.
 */
const FRESH_DATABASE_URL = testDatabaseUrl('karbon_setup_test');

let harness: Harness;

beforeAll(async () => {
  await recreateDatabase(FRESH_DATABASE_URL);
  runInBackend('npx prisma migrate deploy', FRESH_DATABASE_URL);
  // La configuración se lee al importar el módulo: la base se cambia antes de cargar la app.
  vi.stubEnv('DATABASE_URL', FRESH_DATABASE_URL);
  const { startApp } = await import('./integration/harness.js');
  harness = await startApp();
});

afterAll(async () => {
  await harness.close();
  vi.unstubAllEnvs();
});

const api = () => request(harness.app.getHttpServer());

describe('asistente de primer arranque', () => {
  it('una instalación nueva pide configuración y no acepta credenciales por defecto', async () => {
    const status = await api().get('/api/v1/setup/status').expect(200);
    expect((status.body as SetupStatusDto).required).toBe(true);
    await api()
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Admin123*' })
      .expect(401);
  });

  it('crea el bar, el administrador y la demo, y deja la sesión iniciada', async () => {
    const response = await api()
      .post('/api/v1/setup')
      .send({
        restaurantName: 'Bar La Esquina',
        businessMode: 'BAR',
        adminName: 'Dueña',
        adminUsername: 'duena',
        adminPassword: 'ClaveSegura2026',
        adminPin: '2468',
        loadDemoData: true,
      })
      .expect(201);
    const session = response.body as LoginResponse;
    expect(session.user.role.code).toBe('ADMIN');

    const settings = await api()
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(settings.body).toMatchObject({ name: 'Bar La Esquina', businessMode: 'BAR' });
    const products = await api()
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((products.body as unknown[]).length).toBeGreaterThan(0);
    // El rol de preparación se llama "Barra" en modo bar.
    const roles = await api()
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (roles.body as { code: string; name: string }[]).find((role) => role.code === 'KITCHEN')
        ?.name,
    ).toBe('Barra');
  });

  it('no se puede repetir: la instalación queda protegida', async () => {
    const status = await api().get('/api/v1/setup/status').expect(200);
    expect((status.body as SetupStatusDto).required).toBe(false);
    const again = await api()
      .post('/api/v1/setup')
      .send({
        restaurantName: 'Intruso',
        businessMode: 'RESTAURANT',
        adminName: 'Intruso',
        adminUsername: 'intruso',
        adminPassword: 'OtraClave2026',
      })
      .expect(409);
    expect(again.body).toMatchObject({ code: 'SETUP_ALREADY_COMPLETED' });
  });

  it('inicia el periodo de prueba de la licencia al terminar el asistente', async () => {
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'duena', password: 'ClaveSegura2026' })
      .expect(200);
    const license = await api()
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${(login.body as LoginResponse).accessToken}`)
      .expect(200);
    expect(license.body).toMatchObject({ state: 'TRIAL', trialDaysLeft: 30 });
  });
});
