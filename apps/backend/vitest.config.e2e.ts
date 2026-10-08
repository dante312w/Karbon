import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nest y class-validator leen metadatos de decoradores (en producción lo importa main.ts).
    setupFiles: ['reflect-metadata'],
    include: ['test/**/*.e2e.test.ts'],
    // La configuración se valida al importar AppModule: el entorno de prueba se fija aquí.
    // Desarrollo: las apps las sirve Vite en sus puertos, no este servidor.
    env: {
      DEV_MOBILE_PORT: '5174',
      DEV_DESKTOP_PORT: '5173',
      CLIENT_MOBILE_DIR: '',
      CLIENT_DESKTOP_DIR: '',
    },
  },
});
