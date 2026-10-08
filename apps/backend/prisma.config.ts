import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/database/seed/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión, por eso no se exige la variable aquí.
    url: process.env.DATABASE_URL,
  },
});
