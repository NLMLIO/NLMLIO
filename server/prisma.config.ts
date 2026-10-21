import { defineConfig } from 'prisma/config';
import { databaseUrl, loadEnvFiles } from './src/config/env';

loadEnvFiles();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl(),
  },
});
