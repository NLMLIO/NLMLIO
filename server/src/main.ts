import { loadEnvFiles, serverPort } from './config/env';
loadEnvFiles();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(serverPort());
}
void bootstrap();
