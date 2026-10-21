import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { loadEnvFiles } from '../../src/config/env';

// 실제 PostgreSQL·Redis가 필요하다(`pnpm db:up`).
describe('GET /api/health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('DB와 Redis에 연결된다', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: true, redis: true });
  });
});
