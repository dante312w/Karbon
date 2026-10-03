import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://karbon:karbon@localhost:55432/karbon_test';

/** Pruebas de integración contra PostgreSQL real (`npm run test:int`). */
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['test/integration/global-setup.ts'],
    // Un solo proceso: las pruebas comparten la base de datos y siguen un flujo en orden.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'secreto-de-integracion-con-mas-de-treinta-y-dos-caracteres',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      SWAGGER_ENABLED: 'false',
      DATA_DIR: './data-test',
    },
  },
});
