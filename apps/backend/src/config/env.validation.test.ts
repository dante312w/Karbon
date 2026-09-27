import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation.js';

const VALID = {
  DATABASE_URL: 'postgresql://karbon:karbon@localhost:5432/karbon',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnvironment', () => {
  it('aplica valores por defecto seguros', () => {
    const env = validateEnvironment(VALID);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'log',
      SWAGGER_ENABLED: true,
    });
  });

  it('convierte tipos desde cadenas de entorno', () => {
    const env = validateEnvironment({ ...VALID, PORT: '8080', SWAGGER_ENABLED: 'false' });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('rechaza una configuración inválida con un mensaje legible', () => {
    expect(() => validateEnvironment({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnvironment({ ...VALID, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnvironment({ ...VALID, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => validateEnvironment({ ...VALID, DATABASE_URL: 'mysql://x' })).toThrow(
      /PostgreSQL/,
    );
    expect(() => validateEnvironment({ ...VALID, JWT_SECRET: 'corta' })).toThrow(/JWT_SECRET/);
  });
});
