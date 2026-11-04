import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { Fruit, GameClientEvent, GameServerEvent, RoomClientEvent, RoomRole } from '@nlmlio/shared';
import type { AuthResponse, GameAck, GameSnapshot } from '@nlmlio/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { SessionService } from '../../src/common/security/session.service';
import { loadEnvFiles } from '../../src/config/env';
import { Deck } from '../../src/domain/card/deck';
import { Game } from '../../src/domain/game/game';
import type { StartGameInput } from '../../src/domain/game/game';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { REDIS } from '../../src/infra/redis/redis.module';
import { GameStateRepository } from '../../src/infra/redis/game-state.repository';
import { GameFactory } from '../../src/modules/game/game.factory';
import { GameService } from '../../src/modules/game/game.service';
import { RoomService } from '../../src/modules/room/room.service';

describe('게임 서버 Socket.io / Redis / PostgreSQL (FUNC-005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaService;
  let baseUrl: string;
  let code: string;
  let gameId: string;
  let host: AuthResponse;
  let guest: AuthResponse;
  let spectator: AuthResponse;
  let outsider: AuthResponse;
  let a: Socket;
  let b: Socket;
  let c: Socket;
  let d: Socket;
  const sockets: Socket[] = [];
  const gameIds: string[] = [];
  const states = new Map<Socket, GameSnapshot | null>();
  const suffix = Date.now().toString(36);

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
    socket.on(GameServerEvent.STATE, (state: GameSnapshot | null) => states.set(socket, state));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const emit = (socket: Socket, event: string, payload: object = {}): Promise<GameAck> =>
    socket.timeout(3000).emitWithAck(event, payload);
  const snapshot = () => app.get(GameService).sync(host.user.id)!;
  async function waitState(
    socket: Socket,
    predicate: (state: GameSnapshot) => boolean,
  ): Promise<GameSnapshot> {
    const limit = Date.now() + 3000;
    while (Date.now() < limit) {
      const state = states.get(socket);
      if (state && predicate(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Game state was not received');
  }
  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GameFactory)
      .useValue({
        create(input: StartGameInput) {
          gameIds.push(input.gameId);
          const cards = Deck.standard().deal(2).hands.flat();
          const take = (count: number) =>
            cards.splice(
              cards.findIndex((card) => card.fruit === Fruit.STRAWBERRY && card.count === count),
              1,
            )[0];
          const first = take(2);
          const second = take(3);
          return Game.create(input, new Deck([first, second, ...cards]));
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
    [host, guest, spectator, outsider] = await Promise.all(['gh', 'gg', 'gs', 'go'].map(register));
    [a, b, c, d] = await Promise.all([host, guest, spectator, outsider].map(connect));
    code = (
      await request(app.getHttpServer())
        .post('/api/rooms')
        .auth(host.accessToken, { type: 'bearer' })
        .send({ roomName: '엔진 통합 테스트' })
        .expect(201)
    ).body.code;
  }, 30000);
  afterAll(async () => {
    if (!app) return;
    for (const auth of [guest, spectator, host, outsider].filter(Boolean)) {
      if (app.get(RoomService).memberRoom(auth.user.id))
        await app.get(RoomService).leaveMember(auth.user.id);
      await app.get(SessionService).revokeAll(auth.user.id);
    }
    for (const socket of sockets) socket.disconnect();
    await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [host, guest, spectator, outsider].filter(Boolean).map((auth) => auth.user.id) },
      },
    });
    for (const id of gameIds) {
      await app.get(GameStateRepository).clear(id);
      await redis.del(`settled:${id}`);
    }
    await app.close();
  });

  it('최소 인원과 방장 권한을 검증한 뒤 참가자에게만 카드를 나눈다', async () => {
    expect(await emit(a, RoomClientEvent.START)).toEqual({ ok: false, code: 'NOT_ENOUGH_PLAYERS' });
    for (const auth of [guest, spectator])
      await request(app.getHttpServer())
        .post('/api/rooms/join')
        .auth(auth.accessToken, { type: 'bearer' })
        .send({ code })
        .expect(200);
    app.get(RoomService).move(host.user.id, spectator.user.id, RoomRole.SPECTATOR);
    expect(await emit(b, RoomClientEvent.START)).toEqual({ ok: false, code: 'NOT_ROOM_HOST' });
    expect(await emit(a, RoomClientEvent.START)).toEqual({ ok: true });
    const state = await waitState(c, (value) => value.status === 'PLAYING');
    gameId = state.gameId;
    expect(state.players.map((player) => player.userId)).toEqual([host.user.id, guest.user.id]);
    expect(state.players.map((player) => player.handCount)).toEqual([28, 28]);
    expect(state.players[0]).not.toHaveProperty('hand');
    expect(await emit(a, RoomClientEvent.START)).toEqual({ ok: false, code: 'ROOM_IN_GAME' });
  });
  it('다른 방·관전자의 플레이와 클라이언트 조작 필드를 차단한다', async () => {
    const input = { gameId, turnId: snapshot().turnId };
    expect(await emit(d, GameClientEvent.PLAY, input)).toEqual({ ok: false, code: 'NOT_IN_ROOM' });
    expect(await emit(c, GameClientEvent.PLAY, input)).toEqual({
      ok: false,
      code: 'SPECTATOR_FORBIDDEN',
    });
    expect(await emit(c, GameClientEvent.BELL, { gameId, turnSeq: snapshot().turnSeq })).toEqual({
      ok: false,
      code: 'SPECTATOR_FORBIDDEN',
    });
    expect(await emit(b, GameClientEvent.PLAY, input)).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
    expect(await emit(a, GameClientEvent.PLAY, { ...input, userId: guest.user.id })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await emit(a, GameClientEvent.PLAY, { ...input, gameId: 'previous-game' })).toEqual({
      ok: false,
      code: 'GAME_NOT_FOUND',
    });
  });
  it('동시 카드 요청은 한 번만 반영하고 명세의 Redis 상태를 기록한다', async () => {
    const input = { gameId, turnId: snapshot().turnId };
    const replies = await Promise.all([
      emit(a, GameClientEvent.PLAY, input),
      emit(a, GameClientEvent.PLAY, input),
    ]);
    expect(replies).toEqual(expect.arrayContaining([{ ok: true }, { ok: true, ignored: true }]));
    expect(snapshot().turnSeq).toBe(1);
    expect(await redis.hget(`game:${gameId}`, 'turnSeq')).toBe('1');
    expect(await redis.lrange(`game:${gameId}:hand:${host.user.id}`, 0, -1)).toHaveLength(27);
    expect(await redis.lrange(`game:${gameId}:table:${host.user.id}`, 0, -1)).toEqual(['S2']);
    expect(await redis.lrange(`game:${gameId}:order`, 0, -1)).toEqual([
      String(host.user.id),
      String(guest.user.id),
    ]);
    expect(await redis.ttl(`game:${gameId}`)).toBe(-1);
  });
  it('거의 동시에 온 종 두 개 중 하나만 성공하고 뒤 요청은 무시한다', async () => {
    expect(await emit(b, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
      ok: true,
    });
    const turnSeq = snapshot().turnSeq;
    const replies = await Promise.all([
      emit(a, GameClientEvent.BELL, { gameId, turnSeq }),
      emit(b, GameClientEvent.BELL, { gameId, turnSeq }),
    ]);
    expect(replies.filter((reply) => reply.ok && !reply.ignored)).toHaveLength(1);
    expect(replies.filter((reply) => reply.ok && reply.ignored)).toHaveLength(1);
    const stats = await Promise.all(
      [host, guest].map((auth) => redis.hget(`game:${gameId}:stat:${auth.user.id}`, 'bellSuccess')),
    );
    expect(stats.reduce((sum, count) => sum + Number(count), 0)).toBe(1);
    expect(await redis.ttl(`game:${gameId}:bell:${turnSeq}`)).toBeGreaterThan(0);
    expect(snapshot().players.reduce((sum, player) => sum + player.handCount, 0)).toBe(56);
    expect(snapshot().fruitTotals.STRAWBERRY).toBe(0);
  });
  it('오발은 1장과 테이블 전체를 보관하고 모든 관전자에게도 동기화한다', async () => {
    const actor = snapshot().turnUserId === host.user.id ? a : b;
    expect(await emit(actor, GameClientEvent.PLAY, { gameId, turnId: snapshot().turnId })).toEqual({
      ok: true,
    });
    expect(
      await emit(actor, GameClientEvent.BELL, { gameId, turnSeq: snapshot().turnSeq }),
    ).toEqual({ ok: true });
    expect(snapshot().pileCount).toBe(2);
    expect(await redis.llen(`game:${gameId}:pile`)).toBe(2);
    expect((await waitState(c, (state) => state.pileCount === 2)).gameId).toBe(gameId);
  });
  it('새 소켓이 재접속하면 같은 게임 전체 상태를 받는다', async () => {
    const before = snapshot();
    b.disconnect();
    b = await connect(guest);
    const restored = await waitState(b, (state) => state.gameId === gameId);
    expect(restored.turnSeq).toBe(before.turnSeq);
    expect(restored.players.map((player) => player.handCount)).toEqual(
      before.players.map((player) => player.handCount),
    );
    expect(restored.players.find((player) => player.userId === guest.user.id)?.connected).toBe(
      true,
    );
  });
  it('게임 중 나가기는 이탈 정산하고 결과·포인트를 1회 저장한 뒤 Redis 상태를 삭제한다', async () => {
    await request(app.getHttpServer())
      .post('/api/rooms/me/leave')
      .auth(guest.accessToken, { type: 'bearer' })
      .expect(204);
    const state = await waitState(c, (value) => value.status === 'ENDED' && value.settled);
    expect(state.results.map((entry) => [entry.userId, entry.departed, entry.pointDelta])).toEqual([
      [host.user.id, false, 33],
      [guest.user.id, true, 0],
    ]);
    expect(await prisma.game.count({ where: { id: gameId } })).toBe(1);
    expect(await prisma.gameResult.count({ where: { gameId } })).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } })).point).toBe(33);
    expect(await redis.exists(`game:${gameId}`, `game:${gameId}:keys`)).toBe(0);
    expect(await redis.exists(`settled:${gameId}`)).toBe(1);
    expect(app.get(RoomService).memberRoom(host.user.id)?.status).toBe('WAITING');
    expect(await emit(a, GameClientEvent.RETURN)).toEqual({ ok: true });
    expect(await prisma.gameResult.count({ where: { gameId } })).toBe(2);
  });
  it('저장된 이전 게임 후 다음 판을 새 ID로 시작하고 폐기된 인증은 거부한다', async () => {
    app.get(RoomService).move(host.user.id, spectator.user.id, RoomRole.PLAYER);
    expect(await emit(a, RoomClientEvent.START)).toEqual({ ok: true });
    expect(snapshot().gameId).not.toBe(gameId);
    await prisma.user.update({
      where: { id: spectator.user.id },
      data: { authVersion: { increment: 1 } },
    });
    expect(
      await emit(c, GameClientEvent.PLAY, { gameId: snapshot().gameId, turnId: snapshot().turnId }),
    ).toEqual({ ok: false, code: 'TOKEN_INVALID' });
  });
});
