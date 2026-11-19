import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResponse, RoomResponse } from '@nlmlio/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { loadEnvFiles } from '../../src/config/env';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { REDIS } from '../../src/infra/redis/redis.module';
import { RoomCodeRegistry } from '../../src/infra/redis/room-code.registry';
import { SessionService } from '../../src/common/security/session.service';

describe('방 생성·방 코드 발급·코드로 참가 (FUNC-003-01, 003-02, 003-05)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let auth: AuthResponse;
  let guest: AuthResponse;
  const suffix = Date.now().toString(36);
  const password = 'TestPassword123';

  async function register(prefix: string): Promise<AuthResponse> {
    const username = `${prefix}${suffix}`;
    const nickname = `${prefix}${suffix}`.slice(0, 10);
    const check = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password, nickname, nicknameCheckToken: check.body.checkToken })
      .expect(201);
    return (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password })
        .expect(200)
    ).body;
  }

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    redis = app.get(REDIS);
    auth = await register('r');
    guest = await register('g');
  }, 30000);

  afterAll(async () => {
    for (const session of [auth, guest]) {
      if (!session) continue;
      await request(app.getHttpServer())
        .post('/api/rooms/me/leave')
        .auth(session.accessToken, { type: 'bearer' });
      await app.get(SessionService).revokeAll(session.user.id);
      await app.get(PrismaService).user.delete({ where: { id: session.user.id } });
    }
    if (app) await app.close();
  });

  function post(path: string, body?: object, session = auth) {
    return request(app.getHttpServer())
      .post(`/api${path}`)
      .auth(session.accessToken, { type: 'bearer' })
      .send(body);
  }

  it('로그인하지 않으면 만들 수 없다', async () => {
    await request(app.getHttpServer()).post('/api/rooms').send({ roomName: '방' }).expect(401);
  });

  it.each([{ roomName: '   ' }, { roomName: '가'.repeat(21) }, { roomName: 1 }, {}])(
    '입력값이 틀리면 VALIDATION_FAILED (%o)',
    async (body) => {
      const response = await post('/rooms', body).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    },
  );

  it('방을 만들면 6자리 코드를 Redis에 예약하고 만든 회원이 방장이 된다', async () => {
    const response = await post('/rooms', { roomName: ' 점심 내기 한판 ' }).expect(201);
    const room: RoomResponse = response.body;
    expect(room).toMatchObject({
      name: '점심 내기 한판',
      status: 'WAITING',
      hostId: auth.user.id,
      members: [{ userId: auth.user.id, nickname: auth.user.nickname }],
    });
    expect(room.code).toMatch(/^\d{6}$/);
    expect(await redis.ttl(`room-code:${room.code}`)).toBeGreaterThan(0);

    const current = await request(app.getHttpServer())
      .get('/api/rooms/me')
      .auth(auth.accessToken, { type: 'bearer' })
      .expect(200);
    expect(current.body.room).toEqual(room);
  });

  it('이미 방에 있으면 ALREADY_IN_ROOM', async () => {
    const response = await post('/rooms', { roomName: '두 번째' }).expect(409);
    expect(response.body.code).toBe('ALREADY_IN_ROOM');
  });

  it('마지막 인원이 나가면 방이 사라지고 코드 예약이 풀린다', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/rooms/me')
      .auth(auth.accessToken, { type: 'bearer' });
    await post('/rooms/me/leave').expect(204);
    expect(await redis.exists(`room-code:${body.room.code}`)).toBe(0);
    const after = await request(app.getHttpServer())
      .get('/api/rooms/me')
      .auth(auth.accessToken, { type: 'bearer' })
      .expect(200);
    expect(after.body.room).toBeNull();
    const again = await post('/rooms/me/leave').expect(403);
    expect(again.body.code).toBe('NOT_IN_ROOM');
  });

  it('동시에 두 번 요청해도 방은 하나만 만들어진다', async () => {
    const results = await Promise.all([
      post('/rooms', { roomName: '동시 A' }),
      post('/rooms', { roomName: '동시 B' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await post('/rooms/me/leave').expect(204);
  });

  it('방 코드로 참가하면 참가자로 앉고, 방장이 나가면 방장이 넘어온다', async () => {
    const { body: room } = await post('/rooms', { roomName: '코드 참가' }).expect(201);
    expect((await post('/rooms/join', { code: '12345' }, guest).expect(400)).body.code).toBe(
      'VALIDATION_FAILED',
    );
    const missing = room.code === '000000' ? '000001' : '000000';
    expect((await post('/rooms/join', { code: missing }, guest).expect(404)).body.code).toBe(
      'ROOM_NOT_FOUND',
    );
    const joined: RoomResponse = (await post('/rooms/join', { code: room.code }, guest).expect(200))
      .body;
    expect(joined.members).toEqual([
      { userId: auth.user.id, nickname: auth.user.nickname, role: 'PLAYER' },
      { userId: guest.user.id, nickname: guest.user.nickname, role: 'PLAYER' },
    ]);
    expect((await post('/rooms/join', { code: room.code }, guest).expect(409)).body.code).toBe(
      'ALREADY_IN_ROOM',
    );
    await post('/rooms/me/leave').expect(204);
    const after = await request(app.getHttpServer())
      .get('/api/rooms/me')
      .auth(guest.accessToken, { type: 'bearer' })
      .expect(200);
    expect(after.body.room.hostId).toBe(guest.user.id);
    await post('/rooms/me/leave', undefined, guest).expect(204);
    expect(await redis.exists(`room-code:${room.code}`)).toBe(0);
  });

  it('이미 사용 중인 코드는 다시 예약되지 않는다', async () => {
    const codes = app.get(RoomCodeRegistry);
    const code = '999999';
    await codes.release(code);
    expect(await codes.reserve(code)).toBe(true);
    expect(await codes.reserve(code)).toBe(false);
    await codes.release(code);
  });
});
