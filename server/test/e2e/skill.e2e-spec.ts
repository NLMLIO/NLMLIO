import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import {
  Fruit,
  GameClientEvent,
  GameServerEvent,
  ROUND_RESULT_MS,
  RoomClientEvent,
} from '@nlmlio/shared';
import type { AuthResponse, GameAck, GameActionEvent, SkillStateEvent } from '@nlmlio/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { SessionService } from '../../src/common/security/session.service';
import { loadEnvFiles } from '../../src/config/env';
import { Card, Deck } from '../../src/domain/card/deck';
import { Game } from '../../src/domain/game/game';
import type { StartGameInput } from '../../src/domain/game/game';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { GameStateRepository } from '../../src/infra/redis/game-state.repository';
import { REDIS } from '../../src/infra/redis/redis.module';
import { GameFactory } from '../../src/modules/game/game.factory';
import { GameService } from '../../src/modules/game/game.service';
import { RoomService } from '../../src/modules/room/room.service';
import type Redis from 'ioredis';

/** 1번은 딸기 2, 2번은 딸기 3만 낸다. 두 장이면 언제나 종 성공이다. */
const alternating = () =>
  new Deck(
    Array.from(
      { length: 40 },
      (_, index) => new Card(Fruit.STRAWBERRY, (index % 2 === 0 ? 2 : 3) as 2 | 3),
    ),
  );

/** 후보 3칸이 모두 반짝반짝한 카드(플레이어)·침 뱉기(관전자)가 되는 난수 */
const sparkleRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0 : 0.5);
};

describe('스킬 선택 Socket.io 통합 (FUNC-009)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaService;
  let baseUrl: string;
  let code: string;
  let users: AuthResponse[] = [];
  let sockets: Socket[] = [];
  const gameIds: string[] = [];
  const skills = new Map<Socket, SkillStateEvent | null>();
  const actions = new Map<Socket, GameActionEvent[]>();
  const suffix = Date.now().toString(36);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function register(prefix: string): Promise<AuthResponse> {
    const username = `${prefix}${suffix}`;
    const nickname = username.slice(0, 10);
    const checked = await request(app.getHttpServer())
      .get('/api/auth/nickname')
      .query({ nickname })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username,
        nickname,
        password: 'TestPassword123',
        nicknameCheckToken: checked.body.checkToken,
      })
      .expect(201);
    return (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'TestPassword123' })
        .expect(200)
    ).body;
  }
  async function connect(auth: AuthResponse): Promise<Socket> {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token: auth.accessToken },
      reconnection: false,
    });
    sockets.push(socket);
    socket.on(GameServerEvent.ACTION, (action: GameActionEvent) =>
      actions.set(socket, [...(actions.get(socket) ?? []), action]),
    );
    socket.on(GameServerEvent.SKILLS, (state: SkillStateEvent | null) => skills.set(socket, state));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const emit = (socket: Socket, event: string, payload: object = {}): Promise<GameAck> =>
    socket.timeout(3000).emitWithAck(event, payload);
  const join = (auth: AuthResponse) =>
    request(app.getHttpServer())
      .post('/api/rooms/join')
      .auth(auth.accessToken, { type: 'bearer' })
      .send({ code })
      .expect(200);
  async function until(condition: () => boolean, ms = 3000): Promise<void> {
    const limit = Date.now() + ms;
    while (Date.now() < limit) {
      if (condition()) return;
      await sleep(10);
    }
    throw new Error('Condition was not met in time');
  }
  const snapshot = () => app.get(GameService).sync(users[0].user.id)!;

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GameFactory)
      .useValue({
        create(input: StartGameInput) {
          gameIds.push(input.gameId);
          return Game.create(input, alternating(), sparkleRandom());
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    redis = app.get(REDIS);
    prisma = app.get(PrismaService);
    users = await Promise.all(['sh', 'sg', 'ss'].map(register));
    code = (
      await request(app.getHttpServer())
        .post('/api/rooms')
        .auth(users[0].accessToken, { type: 'bearer' })
        .send({ roomName: '스킬 통합 테스트' })
        .expect(201)
    ).body.code;
  }, 30000);
  afterAll(async () => {
    if (!app) return;
    for (const auth of users) {
      if (app.get(RoomService).memberRoom(auth.user.id))
        await app.get(RoomService).leaveMember(auth.user.id);
      await app.get(SessionService).revokeAll(auth.user.id);
    }
    for (const socket of sockets) socket.disconnect();
    await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((auth) => auth.user.id) } } });
    for (const id of gameIds) {
      await app.get(GameStateRepository).clear(id);
      await redis.del(`settled:${id}`);
    }
    await app.close();
  });

  it('종 성공 5번이면 선택이 열려 본인에게만 후보를 보내고, 전원이 고르면 게임이 이어진다', async () => {
    const [a, b] = [await connect(users[0]), await connect(users[1])];
    await join(users[1]);
    expect(await emit(a, RoomClientEvent.START)).toEqual({ ok: true });
    const gameId = snapshot().gameId;
    // 도중에 들어온 사람은 관전자로 선택에 참여한다.
    await join(users[2]);
    const c = await connect(users[2]);
    await until(() => skills.get(c) !== undefined);

    for (let round = 1; round <= 5; round++) {
      expect(await emit(a, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
        ok: true,
      });
      expect(await emit(b, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
        ok: true,
      });
      expect(await emit(a, GameClientEvent.BELL, { gameId, turnSeq: snapshot().turnSeq })).toEqual({
        ok: true,
      });
      expect(snapshot().skillSuccesses).toBe(round);
      if (round < 5) {
        expect(snapshot().skillPick).toBeNull();
        await sleep(ROUND_RESULT_MS + 150);
      }
    }
    // 결과 표시가 끝나기 전에는 열리지 않고, 끝나면 열린다.
    expect(snapshot().skillPick).toBeNull();
    await until(() => snapshot().skillPick !== null, ROUND_RESULT_MS + 1500);
    expect(snapshot()).toMatchObject({
      skillPick: { pickNo: 1, done: 0, total: 3 },
      turnDeadline: null,
    });

    await until(
      () =>
        skills.get(a)?.pick != null && skills.get(b)?.pick != null && skills.get(c)?.pick != null,
    );
    expect(skills.get(a)!.pick).toMatchObject({ role: 'PLAYER', candidate: null });
    expect(skills.get(c)!.pick).toMatchObject({ role: 'SPECTATOR' });
    expect(skills.get(a)!.pick!.candidates).toHaveLength(3);
    for (const id of skills.get(c)!.pick!.candidates)
      expect(['SPIT', 'RUSSIAN_ROULETTE']).toContain(id);
    expect(skills.get(a)!.pick!.candidates).not.toContain('RUSSIAN_ROULETTE');

    // 선택 중에는 카드 내기가 무시된다.
    expect(await emit(a, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
      ok: true,
      ignored: true,
    });
    // 잘못된 칸은 거부한다.
    expect(await emit(a, GameClientEvent.SKILL_PICK, { gameId, choice: { slot: 7 } })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });

    expect(await emit(a, GameClientEvent.SKILL_PICK, { gameId, choice: { slot: 1 } })).toEqual({
      ok: true,
    });
    expect(await emit(a, GameClientEvent.SKILL_PICK, { gameId, choice: { slot: 0 } })).toEqual({
      ok: true,
      ignored: true,
    });
    await until(() => skills.get(a)?.pick?.candidate === 1);
    expect(skills.get(a)!.slots).toHaveLength(1);
    expect(snapshot().skillPick).toMatchObject({ done: 1, total: 3 });
    expect(await emit(b, GameClientEvent.SKILL_PICK, { gameId, choice: { slot: 2 } })).toEqual({
      ok: true,
    });
    expect(await emit(c, GameClientEvent.SKILL_PICK, { gameId, choice: { slot: 0 } })).toEqual({
      ok: true,
    });

    await until(() => snapshot().skillPick === null);
    await until(() => skills.get(a)?.pick === null && skills.get(c)?.pick === null);
    expect(skills.get(a)!.slots).toHaveLength(1);
    expect(skills.get(b)!.slots).toHaveLength(1);
    expect(skills.get(c)!.slots).toHaveLength(1);
    expect(snapshot().turnDeadline).toBeGreaterThan(Date.now());
    // ---- 스킬 사용(FUNC-009-04) ----
    // 틀린 입력은 거부한다.
    expect(await emit(a, GameClientEvent.SKILL_USE, { gameId, slot: 3 })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(
      await emit(a, GameClientEvent.SKILL_USE, { gameId, slot: 0, targetUserId: users[1].user.id }),
    ).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await emit(a, GameClientEvent.SKILL_USE, { gameId, slot: 1 })).toEqual({
      ok: false,
      code: 'SKILL_UNAVAILABLE',
    });
    // 효과를 구현하지 않은 스킬(관전자의 침 뱉기)은 쓸 수 없다.
    expect(
      await emit(c, GameClientEvent.SKILL_USE, { gameId, slot: 0, targetUserId: users[0].user.id }),
    ).toEqual({ ok: false, code: 'SKILL_UNAVAILABLE' });
    expect(skills.get(c)!.slots).toHaveLength(1);

    // 반짝반짝한 카드: 쓰면 모두에게 알리고 내 슬롯에서 사라진다.
    expect(await emit(a, GameClientEvent.SKILL_USE, { gameId, slot: 0 })).toEqual({ ok: true });
    await until(() => (actions.get(b) ?? []).some((action) => action.kind === 'skill'));
    await until(() => (actions.get(c) ?? []).some((action) => action.kind === 'skill'));
    const cast = (actions.get(b) ?? []).find((action) => action.kind === 'skill')!;
    expect(cast).toMatchObject({
      kind: 'skill',
      userId: users[0].user.id,
      skillId: 'SPARKLE_CARD',
      targetUserId: null,
    });
    await until(() => skills.get(a)?.slots.length === 0);
    expect(skills.get(b)!.slots).toHaveLength(1);
    // 다시 쓰면 빈 칸이라 거부한다.
    expect(await emit(a, GameClientEvent.SKILL_USE, { gameId, slot: 0 })).toEqual({
      ok: false,
      code: 'SKILL_UNAVAILABLE',
    });

    // 게임이 이어진다: 다음에 내는 카드가 금칠이 되고 판정에는 영향이 없다.
    expect(await emit(a, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
      ok: true,
    });
    expect(snapshot().players[0].topCard).toMatchObject({ gilded: true });
    expect(await emit(b, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
      ok: true,
    });
    expect(snapshot().players[1].topCard).not.toHaveProperty('gilded');
    expect(await emit(a, GameClientEvent.BELL, { gameId, turnSeq: snapshot().turnSeq })).toEqual({
      ok: true,
    });
    expect(snapshot().players[0].topCard).toBeNull();
  }, 60000);
});
