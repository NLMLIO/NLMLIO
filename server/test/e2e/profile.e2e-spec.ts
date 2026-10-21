import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResponse, PublicUser, SettleGameInput } from '@nlmlio/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { loadEnvFiles } from '../../src/config/env';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { GameResultService } from '../../src/modules/game/game-result.service';
import { SessionService } from '../../src/common/security/session.service';

describe('마이페이지·전적 실제 PostgreSQL/Redis 통합', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let settlement: GameResultService;
  let me: PublicUser;
  let other: PublicUser;
  let auth: AuthResponse;
  let cookie: string;
  const suffix = Date.now().toString(36);
  const username = `u${suffix}`;
  const password = 'TestPassword123';
  const gamePrefix = `e2e-${suffix}`;

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    settlement = app.get(GameResultService);
    me = await signup(username, `나${suffix}`);
    other = await signup(`v${suffix}`, `너${suffix}`);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    auth = response.body;
    cookie = response.headers['set-cookie'][0].split(';')[0];
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.gameResult.deleteMany({ where: { gameId: { startsWith: gamePrefix } } });
      await prisma.game.deleteMany({ where: { id: { startsWith: gamePrefix } } });
      for (const account of [me, other].filter(Boolean))
        await app.get(SessionService).revoke(account.id);
      await prisma.user.deleteMany({ where: { username: { in: [username, `v${suffix}`] } } });
    }
    if (app) await app.close();
  });

  async function signup(login: string, nickname: string): Promise<PublicUser> {
    const check = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname })
      .expect(200);
    const result = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username: login,
        password,
        nickname,
        email: `${login}@example.com`,
        nicknameCheckToken: check.body.checkToken,
      })
      .expect(201);
    return result.body;
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(`/api${path}`)
      .auth(auth.accessToken, { type: 'bearer' });
  }
  function patch(body: object) {
    return request(app.getHttpServer())
      .patch('/api/users/me')
      .auth(auth.accessToken, { type: 'bearer' })
      .send(body);
  }
  function game(id: string, rank = 1): SettleGameInput {
    return {
      gameId: `${gamePrefix}-${id}`,
      roomCode: '123456',
      roomName: `실제 게임 ${id}`,
      startedAt: '2026-10-20T00:00:00Z',
      endedAt: `2026-10-20T00:${id === 'one' ? '10' : '20'}:00Z`,
      players: [
        { userId: me.id, rank, departed: false, bellSuccess: 7, bellFail: 3, reactionSumMs: 2940 },
        {
          userId: other.id,
          rank: rank === 1 ? 2 : 1,
          departed: false,
          bellSuccess: 2,
          bellFail: 1,
          reactionSumMs: 1000,
        },
      ],
    };
  }

  it('인증 없이 또는 임의 사용자 헤더로 개인 정보를 읽을 수 없다', async () => {
    await request(app.getHttpServer())
      .get('/api/users/me/dashboard')
      .set('x-user-id', String(me.id))
      .expect(401);
  });

  it('빈 계정 통계와 비밀번호 비노출을 확인한다', async () => {
    const response = await get('/users/me/dashboard').expect(200);
    expect(response.body.stats).toMatchObject({
      totalGames: 0,
      winRate: 0,
      averageReactionMs: null,
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    const rows = await get('/users/me/history').expect(200);
    expect(rows.body.items).toEqual([]);
  });

  it('중복 확인을 하지 않거나 다른 닉네임 확인 토큰으로 저장할 수 없다', async () => {
    await patch({ nickname: `새${suffix}` }).expect(400);
    const check = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname: `새${suffix}` })
      .expect(200);
    await patch({ nickname: `또${suffix}`, nicknameCheckToken: check.body.checkToken }).expect(400);
  });

  it('중복 닉네임·이메일과 null 입력을 거부한다', async () => {
    const check = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname: other.nickname })
      .expect(200);
    expect(check.body.available).toBe(false);
    await patch({ email: other.email })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('EMAIL_TAKEN'));
    await patch({ email: null }).expect(400);
    await patch({ userId: other.id, point: 100000 }).expect(400);
  });

  it('닉네임 확인 후 변경을 저장한다', async () => {
    const nickname = `새${suffix}`;
    const check = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname })
      .expect(200);
    const response = await patch({
      nickname,
      nicknameCheckToken: check.body.checkToken,
      email: `new${username}@example.com`,
    }).expect(200);
    expect(response.body.user.nickname).toBe(nickname);
    expect(response.body.requiresLogin).toBe(false);
  });

  it('결과·포인트를 1회 정산하고 누적 통계·최신순 페이지 조회에 반영한다', async () => {
    expect(await settlement.settle(game('one'))).toEqual({ saved: true });
    expect(await settlement.settle(game('one'))).toEqual({ saved: false });
    await settlement.settle(game('two', 2));
    const response = await get('/users/me/dashboard').expect(200);
    expect(response.body.user.point).toBe(33);
    expect(response.body.stats).toMatchObject({
      totalGames: 2,
      wins: 1,
      losses: 1,
      winRate: 50,
      bellSuccessRate: 70,
      averageReactionMs: 420,
      bellFail: 6,
    });
    const first = await get('/users/me/history?page=1&pageSize=1').expect(200);
    const second = await get('/users/me/history?page=2&pageSize=1').expect(200);
    expect(first.body.total).toBe(2);
    expect(first.body.items[0].gameId).toBe(`${gamePrefix}-two`);
    expect(second.body.items[0].gameId).toBe(`${gamePrefix}-one`);
    await get('/users/me/history?page=0').expect(400);
  });

  it('동시 중복 정산도 1회만 지급한다', async () => {
    const results = await Promise.all([
      settlement.settle(game('race')),
      settlement.settle(game('race')),
    ]);
    expect(results.filter((result) => result.saved)).toHaveLength(1);
    expect((await get('/users/me/dashboard')).body.user.point).toBe(55);
  });

  it('중간 결과 저장 실패 시 게임·포인트를 모두 롤백한다', async () => {
    const input = game('rollback');
    input.players[1].userId = 2147483647;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    await expect(settlement.settle(input)).rejects.toThrow();
    expect(await prisma.game.count({ where: { id: input.gameId } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).point).toBe(
      before.point,
    );
  });

  it('동점은 점수 도달 시각, 가입일, ID 순서로 정렬한다', async () => {
    await prisma.user.update({
      where: { id: me.id },
      data: { point: 10, pointReachedAt: new Date('2026-10-01') },
    });
    await prisma.user.update({
      where: { id: other.id },
      data: { point: 10, pointReachedAt: new Date('2026-10-02') },
    });
    const response = await get('/ranking').expect(200);
    expect(response.body.me.rank).toBe(1);
    expect(response.body.items[0].userId).toBe(me.id);
    expect(response.body.items[0].email).toBeUndefined();
  });

  it('Refresh를 회전하고 이전 토큰의 재사용을 거부한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    const nextCookie = response.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    auth = response.body;
    cookie = nextCookie;
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });

  it('현재 비밀번호 오입력 시 전체 변경을 거부한다', async () => {
    await patch({
      currentPassword: 'WrongPassword1',
      newPassword: 'ChangedPassword2',
      email: 'invalidchange@example.com',
    })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_CREDENTIALS'));
    expect((await get('/users/me')).body.email).toBe(`new${username}@example.com`);
  });

  it('비밀번호를 바꾸면 기존 Access·Refresh가 무효화되고 새 비밀번호로 로그인할 수 있다', async () => {
    const response = await patch({
      currentPassword: password,
      newPassword: 'ChangedPassword2',
    }).expect(200);
    expect(response.body.requiresLogin).toBe(true);
    await get('/users/me').expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: 'ChangedPassword2' })
      .expect(200);
  });
});
