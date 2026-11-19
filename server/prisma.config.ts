import { defineConfig } from 'prisma/config';
import { databaseUrl, loadEnvFiles } from './src/config/env';

loadEnvFiles();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --project tsconfig.seed.json prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl(),
  },
});
