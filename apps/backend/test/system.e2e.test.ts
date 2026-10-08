import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerInfo } from '@karbon/types';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Sustituto de PrismaService: estas pruebas validan la capa HTTP sin base de datos real. */
class FakePrismaService {
  databaseUp = true;

  isDatabaseUp(): Promise<boolean> {
    return Promise.resolve(this.databaseUp);
  }
}

describe('Sistema (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new FakePrismaService();

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://karbon:karbon@localhost:5432/karbon';
    process.env.JWT_SECRET ??= 'secreto-de-pruebas-e2e-con-mas-de-32-caracteres';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health responde ok con cabeceras de seguridad', async () => {
    prisma.databaseUp = true;
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /api/v1/health responde 503 si la base de datos no responde', async () => {
    prisma.databaseUp = false;
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(response.body).toMatchObject({ status: 'degraded', database: 'down' });
    prisma.databaseUp = true;
  });

  it('GET /api/v1/system/info expone nombre, versión y URLs de la LAN', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/system/info').expect(200);
    expect(response.body).toMatchObject({ name: 'Karbon POS', version: expect.any(String) });
    const body = response.body as ServerInfo;
    expect(Array.isArray(body.lanUrls)).toBe(true);
    // Una dirección por cada IP de la red local, apuntando a los servidores de Vite.
    expect(body.waiterAppUrls).toHaveLength(body.lanUrls.length);
    expect(body.waiterAppUrls.every((url) => url.endsWith(':5174/'))).toBe(true);
    expect(body.kdsUrls.every((url) => url.endsWith(':5173/#/kds'))).toBe(true);
  });

  it('CORS acepta orígenes de la red local y rechaza los públicos', async () => {
    const lan = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://192.168.1.20:5173');
    expect(lan.headers['access-control-allow-origin']).toBe('http://192.168.1.20:5173');

    const external = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example.com');
    expect(external.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('publica el documento OpenAPI', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const document = response.body as { info: { title: string }; paths: Record<string, unknown> };
    expect(document.info.title).toBe('Karbon POS API');
    expect(Object.keys(document.paths)).toContain('/api/v1/health');
  });

  it('responde 404 a rutas desconocidas', async () => {
    await request(app.getHttpServer()).get('/api/v1/no-existe').expect(404);
  });
});
