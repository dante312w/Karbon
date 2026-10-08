import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nest y class-validator leen metadatos de decoradores (en producción lo importa main.ts).
    setupFiles: ['reflect-metadata'],
    include: ['src/**/*.test.ts'],
  },
});
