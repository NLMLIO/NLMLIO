import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { PasswordService } from '../../src/common/security/password.service';
import { SessionService } from '../../src/common/security/session.service';
import { loadEnvFiles } from '../../src/config/env';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { REDIS } from '../../src/infra/redis/redis.module';

describe('로그인·기기별 세션 실제 PostgreSQL/Redis 통합 (FUNC-001-04, 001-05)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: number;
  const suffix = Date.now().toString(36);
  const username = `a${suffix}`;
  const password = 'TestPassword123';

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        username,
        nickname: `세${suffix}`.slice(0, 10),
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    userId = user.id;
  }, 30000);

  afterAll(async () => {
    if (prisma && userId) {
      await app.get(SessionService).revokeAll(userId);
      await prisma.user.delete({ where: { id: userId } });
    }
    if (app) await app.close();
  });

  async function login(): Promise<{ accessToken: string; cookie: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return {
      accessToken: response.body.accessToken,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  }

  function refresh(cookie: string) {
    return request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);
  }

  it('틀린 비밀번호는 INVALID_CREDENTIALS로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: 'WrongPassword1' })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_CREDENTIALS'));
  });

  it('한 기기의 재발급은 다른 기기의 세션을 건드리지 않는다', async () => {
    const pc = await login();
    const phone = await login();
    const rotated = await refresh(pc.cookie).expect(200);
    await refresh(pc.cookie).expect(401);
    await refresh(phone.cookie).expect(200);
    await refresh(rotated.headers['set-cookie'][0].split(';')[0]).expect(200);
  });

  it('로그아웃은 그 기기의 세션만 끝낸다', async () => {
    const pc = await login();
    const phone = await login();
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', pc.cookie)
      .expect(204)
      .expect((res) => expect(res.headers['set-cookie'][0]).toContain('nlmlio_refresh=;'));
    await refresh(pc.cookie).expect(401);
    await refresh(phone.cookie).expect(200);
  });

  it('비밀번호를 바꾸면 모든 기기의 세션이 끝난다', async () => {
    const pc = await login();
    const phone = await login();
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .auth(pc.accessToken, { type: 'bearer' })
      .send({ currentPassword: password, newPassword: 'ChangedPassword2' })
      .expect(200);
    await refresh(pc.cookie).expect(401);
    await refresh(phone.cookie).expect(401);
    const keys = await app.get<Redis>(REDIS).keys(`refresh:${userId}:*`);
    expect(keys).toEqual([]);
  });
});
