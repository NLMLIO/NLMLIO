import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResponse, ChatAck, ChatMessageEvent, EmojiMessageEvent } from '@nlmlio/shared';
import { ChatEvent } from '@nlmlio/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { loadEnvFiles } from '../../src/config/env';
import { SessionService } from '../../src/common/security/session.service';
import { PrismaService } from '../../src/infra/database/prisma.service';
import { RoomStore } from '../../src/infra/game-state/room.store';
import { REDIS } from '../../src/infra/redis/redis.module';
import { RoomService } from '../../src/modules/room/room.service';

describe('채팅 Socket.io / Redis 통합 (FUNC-004-01, FUNC-004-02)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaService;
  let baseUrl: string;
  let code: string;
  let outsiderCode: string;
  let host: AuthResponse;
  let guest: AuthResponse;
  let outsider: AuthResponse;
  const sockets: Socket[] = [];
  const suffix = Date.now().toString(36);

  async function signup(prefix: string): Promise<AuthResponse> {
    const username = `${prefix}${suffix}`;
    const nickname = `${prefix}${suffix}`.slice(0, 10);
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
        email: `${username}@example.com`,
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

  async function connect(token: string): Promise<Socket> {
    const socket = io(baseUrl, { transports: ['websocket'], auth: { token }, reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function emit(socket: Socket, event: string, payload?: object): Promise<ChatAck> {
    return socket.timeout(2000).emitWithAck(event, payload);
  }

  function next<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out: ${event}`)), 2000);
      socket.once(event, (value: T) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  beforeAll(async () => {
    loadEnvFiles();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('No test server port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    redis = app.get(REDIS);
    prisma = app.get(PrismaService);
    [host, guest, outsider] = await Promise.all([signup('h'), signup('g'), signup('o')]);
    const created = await request(app.getHttpServer())
      .post('/api/rooms')
      .auth(host.accessToken, { type: 'bearer' })
      .send({ roomName: '채팅 통합 테스트', maxPlayers: 4 })
      .expect(201);
    code = created.body.code;
    outsiderCode = (
      await request(app.getHttpServer())
        .post('/api/rooms')
        .auth(outsider.accessToken, { type: 'bearer' })
        .send({ roomName: '다른 방', maxPlayers: 4 })
        .expect(201)
    ).body.code;
    const roomStore = app.get(RoomStore);
    const room = roomStore.findByMember(host.user.id)!;
    room.join({ userId: guest.user.id, nickname: guest.user.nickname });
    roomStore.addMember(room, guest.user.id);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (app) {
      for (const account of [host, outsider].filter(Boolean)) {
        const room = app.get(RoomStore).findByMember(account.user.id);
        if (room) {
          for (const member of room.snapshot().members) {
            room.leave(member.userId);
            app.get(RoomStore).removeMember(room, member.userId);
          }
          await redis.del(`room-code:${room.code}`);
        }
      }
      for (const account of [host, guest, outsider].filter(Boolean)) {
        await app.get(SessionService).revokeAll(account.user.id);
        await redis.del(`chat-limit:${account.user.id}`, `emoji:cd:${account.user.id}`);
      }
      await prisma.user.deleteMany({
        where: {
          id: { in: [host, guest, outsider].filter(Boolean).map((account) => account.user.id) },
        },
      });
      await app.close();
    }
  });

  it('Access가 없거나 위조되면 연결을 거부한다', async () => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token: 'invalid' },
      reconnection: false,
    });
    sockets.push(socket);
    const error = await next<Error & { data?: { code: string } }>(socket, 'connect_error');
    expect(error.data?.code).toBe('TOKEN_INVALID');
    expect(socket.connected).toBe(false);
  });

  it('방 소속만 입장·전송하고 같은 방의 두 회원에게 실시간으로 전달한다', async () => {
    const a = await connect(host.accessToken);
    const b = await connect(guest.accessToken);
    const c = await connect(outsider.accessToken);
    expect(await emit(c, ChatEvent.JOIN, { code })).toEqual({ ok: false, code: 'NOT_IN_ROOM' });
    expect(await emit(c, ChatEvent.JOIN, { code: outsiderCode })).toEqual({ ok: true });
    expect(await emit(a, ChatEvent.SEND, { message: '입장 전' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
    });
    expect(await emit(a, ChatEvent.JOIN, { code })).toEqual({ ok: true });
    expect(await emit(b, ChatEvent.JOIN, { code })).toEqual({ ok: true });
    const receivedA = next<ChatMessageEvent>(a, ChatEvent.MESSAGE);
    const receivedB = next<ChatMessageEvent>(b, ChatEvent.MESSAGE);
    let leaked = false;
    c.once(ChatEvent.MESSAGE, () => {
      leaked = true;
    });
    expect(await emit(a, ChatEvent.SEND, { message: '  안녕하세요  ' })).toEqual({ ok: true });
    expect(await receivedA).toMatchObject({
      roomCode: code,
      userId: host.user.id,
      nickname: host.user.nickname,
      message: '안녕하세요',
    });
    expect(await receivedB).toMatchObject({
      roomCode: code,
      userId: host.user.id,
      nickname: host.user.nickname,
      message: '안녕하세요',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(leaked).toBe(false);
    expect(await redis.exists(`chat:${code}`)).toBe(0);
  });

  it('chat:leave 뒤에는 재입장 전까지 전송하지 못한다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    expect(await emit(a, ChatEvent.LEAVE)).toEqual({ ok: true });
    expect(await emit(a, ChatEvent.SEND, { message: '나간 상태' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
    });
    expect(await emit(a, ChatEvent.JOIN, { code })).toEqual({ ok: true });
  });

  it('빈 글·200자 초과·여분 필드·잘못된 코드를 거부한다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    for (const message of ['', '   ', '가'.repeat(201)])
      expect(await emit(a, ChatEvent.SEND, { message })).toEqual({
        ok: false,
        code: 'CHAT_TOO_LONG',
      });
    expect(await emit(a, ChatEvent.SEND, {})).toEqual({ ok: false, code: 'CHAT_TOO_LONG' });
    expect(await emit(a, ChatEvent.SEND, { message: null })).toEqual({
      ok: false,
      code: 'CHAT_TOO_LONG',
    });
    expect(await emit(a, ChatEvent.SEND, { message: 'hi', userId: outsider.user.id })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await emit(a, ChatEvent.JOIN, { code: 'x' })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
  });

  it('텍스트는 사용자별 3초에 5개이며 TTL 후 다시 보낼 수 있다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    await redis.del(`chat-limit:${host.user.id}`);
    for (let i = 0; i < 5; i++)
      expect(await emit(a, ChatEvent.SEND, { message: `메시지 ${i}` })).toEqual({ ok: true });
    expect(await emit(a, ChatEvent.SEND, { message: '여섯 번째' })).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
    });
    expect(await redis.ttl(`chat-limit:${host.user.id}`)).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 3100));
    expect(await emit(a, ChatEvent.SEND, { message: '다시 허용' })).toEqual({ ok: true });
  }, 10000);

  it('이모티콘은 허용 목록만 받고 사용자별 2초 쿨다운을 적용한다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    const b = sockets.filter((socket) => socket.connected)[1];
    expect(await emit(a, ChatEvent.EMOJI_SEND, { emoji: 'UNKNOWN' })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    const received = next<EmojiMessageEvent>(b, ChatEvent.EMOJI);
    expect(await emit(a, ChatEvent.EMOJI_SEND, { emoji: 'CLAP' })).toEqual({ ok: true });
    expect(await received).toMatchObject({ roomCode: code, userId: host.user.id, emoji: 'CLAP' });
    expect(await emit(a, ChatEvent.EMOJI_SEND, { emoji: 'JOY' })).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
    });
    expect(await redis.ttl(`emoji:cd:${host.user.id}`)).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(await emit(a, ChatEvent.EMOJI_SEND, { emoji: 'JOY' })).toEqual({ ok: true });
  }, 10000);

  it('관전자가 채팅·이모티콘을 보내고 같은 방 채팅을 받는다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    const b = sockets.filter((socket) => socket.connected)[1];
    app.get(RoomService).markSpectator(guest.user.id);
    const received = next<ChatMessageEvent>(a, ChatEvent.MESSAGE);
    expect(await emit(b, ChatEvent.SEND, { message: '관전 중' })).toEqual({ ok: true });
    expect(await received).toMatchObject({ userId: guest.user.id, isSpectator: true });
    const emojiReceived = next<EmojiMessageEvent>(a, ChatEvent.EMOJI);
    expect(await emit(b, ChatEvent.EMOJI_SEND, { emoji: 'LIKE' })).toEqual({ ok: true });
    expect(await emojiReceived).toMatchObject({
      userId: guest.user.id,
      isSpectator: true,
      emoji: 'LIKE',
    });
    const spectatorReceived = next<ChatMessageEvent>(b, ChatEvent.MESSAGE);
    await redis.del(`chat-limit:${host.user.id}`);
    expect(await emit(a, ChatEvent.SEND, { message: '관전자에게도 전달' })).toEqual({ ok: true });
    expect(await spectatorReceived).toMatchObject({
      userId: host.user.id,
      message: '관전자에게도 전달',
    });
  });

  it('같은 계정의 여러 소켓에도 하나의 전송 제한을 적용한다', async () => {
    const first = sockets.find((socket) => socket.connected)!;
    const second = await connect(host.accessToken);
    expect(await emit(second, ChatEvent.JOIN, { code })).toEqual({ ok: true });
    await redis.del(`chat-limit:${host.user.id}`, `emoji:cd:${host.user.id}`);
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        emit(index % 2 ? first : second, ChatEvent.SEND, { message: `동시 ${index}` }),
      ),
    );
    expect(attempts.filter((result) => result.ok)).toHaveLength(5);
    expect(attempts.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'RATE_LIMITED' }]);
    const emojiAttempts = await Promise.all([
      emit(first, ChatEvent.EMOJI_SEND, { emoji: 'JOY' }),
      emit(second, ChatEvent.EMOJI_SEND, { emoji: 'SAD' }),
    ]);
    expect(emojiAttempts.filter((result) => result.ok)).toHaveLength(1);
    expect(emojiAttempts.filter((result) => !result.ok)).toEqual([
      { ok: false, code: 'RATE_LIMITED' },
    ]);
  });

  it('방에서 나가거나 인증 버전이 바뀌면 기존 소켓도 전송할 수 없다', async () => {
    const a = sockets.find((socket) => socket.connected)!;
    const b = sockets.filter((socket) => socket.connected)[1];
    const roomStore = app.get(RoomStore);
    const room = roomStore.findByMember(guest.user.id)!;
    room.leave(guest.user.id);
    roomStore.removeMember(room, guest.user.id);
    expect(await emit(b, ChatEvent.SEND, { message: '나간 뒤' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
    });
    await redis.del(`chat-limit:${host.user.id}`);
    let deliveredAfterLeave = false;
    b.once(ChatEvent.MESSAGE, () => {
      deliveredAfterLeave = true;
    });
    expect(await emit(a, ChatEvent.SEND, { message: '남은 사람' })).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deliveredAfterLeave).toBe(false);
    await prisma.user.update({
      where: { id: host.user.id },
      data: { authVersion: { increment: 1 } },
    });
    expect(await emit(a, ChatEvent.SEND, { message: '폐기된 Access' })).toEqual({
      ok: false,
      code: 'TOKEN_INVALID',
    });
  });
});
