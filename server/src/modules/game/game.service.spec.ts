import { Fruit } from '@nlmlio/shared';
import { Card, Deck } from '../../domain/card/deck';
import { Game } from '../../domain/game/game';
import { Room } from '../../domain/room/room';
import { GameStore } from '../../infra/game-state/game.store';
import { RoomQueue } from '../../infra/game-state/room-queue';
import type { GameStateRepository } from '../../infra/redis/game-state.repository';
import { RoomGameLifecycle } from '../room/room-game.lifecycle';
import type { RoomService } from '../room/room.service';
import type { GameEvents } from './game.events';
import type { GameFactory } from './game.factory';
import type { GameResultService } from './game-result.service';
import { GameService } from './game.service';
import { GameTimers } from './game-timers';

describe('GameService 방 큐·타이머·정산 재시도', () => {
  let service: GameService;
  let timers: GameTimers;
  let store: GameStore;
  let lifecycle: RoomGameLifecycle;
  let room: Room;
  let snapshots: { save: jest.Mock; claimBell: jest.Mock; clear: jest.Mock };
  let results: { settle: jest.Mock };
  let events: { state: jest.Mock; action: jest.Mock };
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date('2026-11-04T00:00:00Z') });
    room = Room.create({ code: '123456', name: '타이머', host: { userId: 1, nickname: '하나' } });
    room.join({ userId: 2, nickname: '둘' });
    const rooms = {
      memberRoom: (id: number) => (room.has(id) ? room.snapshot() : null),
      beginGame: (id: number) => {
        room.start(id);
        return room.snapshot();
      },
      markSpectator: (id: number) => room.markSpectator(id),
      finishGame: () => room.finish(),
      leaveMember: async (id: number) => {
        room.leave(id);
      },
    };
    snapshots = {
      save: jest.fn().mockResolvedValue(undefined),
      claimBell: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    results = { settle: jest.fn().mockResolvedValue({ saved: true }) };
    events = { state: jest.fn(), action: jest.fn() };
    timers = new GameTimers();
    store = new GameStore();
    lifecycle = new RoomGameLifecycle();
    service = new GameService(
      rooms as unknown as RoomService,
      lifecycle,
      store,
      new RoomQueue(),
      { create: (input) => Game.create(input, Deck.standard()) } as GameFactory,
      snapshots as unknown as GameStateRepository,
      results as unknown as GameResultService,
      events as unknown as GameEvents,
      timers,
    );
    service.onModuleInit();
    await service.connected(1, 'one');
    await service.connected(2, 'two');
    await service.start(1);
  });
  afterEach(() => {
    timers.onModuleDestroy();
    jest.useRealTimers();
  });
  const state = () => service.sync(1)!;

  it('10초마다 자동 진행하고 같은 회원이 세 번 연속 자동 내기하면 이탈한다', async () => {
    await jest.advanceTimersByTimeAsync(9999);
    expect(state().turnSeq).toBe(0);
    await jest.advanceTimersByTimeAsync(40001);
    expect(state().status).toBe('ENDED');
    expect(state().players[0]).toMatchObject({ status: 'DEPARTED', automaticTurns: 3 });
    expect(results.settle).toHaveBeenCalledTimes(1);
    const actions = events.action.mock.calls.length;
    await jest.advanceTimersByTimeAsync(30000);
    expect(events.action).toHaveBeenCalledTimes(actions);
  });
  it('차례가 바뀌면 이전 타이머를 취소하고 새 마감 시간까지 기다린다', async () => {
    await jest.advanceTimersByTimeAsync(9000);
    await service.play(1, { gameId: state().gameId, turnId: state().turnId });
    await jest.advanceTimersByTimeAsync(1000);
    expect(state().turnSeq).toBe(1);
    await jest.advanceTimersByTimeAsync(9000);
    expect(state().turnSeq).toBe(2);
    expect(state().players[1].automaticTurns).toBe(1);
  });
  it('여러 탭 중 하나만 끊기면 연결을 유지하고, 5초 안 재접속하면 유예를 취소한다', async () => {
    await service.connected(2, 'two-extra');
    await service.disconnected(2, 'two');
    expect(state().players[1].connected).toBe(true);
    await service.disconnected(2, 'two-extra');
    expect(state().players[1].connected).toBe(false);
    await jest.advanceTimersByTimeAsync(4999);
    await service.connected(2, 'two-reconnected');
    await jest.advanceTimersByTimeAsync(1);
    expect(state().players[1]).toMatchObject({ status: 'ACTIVE', connected: true });
    await service.disconnected(2, 'two-reconnected');
    await jest.advanceTimersByTimeAsync(5000);
    expect(state().players[1].status).toBe('DEPARTED');
    expect(state().settled).toBe(true);
    expect(room.snapshot().members).toHaveLength(2);
  });
  it('Redis 미러 저장에 실패해도 확정한 카드를 되돌리지 않고 다음에 같은 상태를 재시도한다', async () => {
    snapshots.save.mockRejectedValueOnce(new Error('Redis unavailable'));
    const id = state().gameId;
    expect(await service.play(1, { gameId: id, turnId: state().turnId })).toBe(true);
    expect(state().turnSeq).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(snapshots.save).toHaveBeenCalledTimes(3);
    expect(state().turnSeq).toBe(1);
  });
  it('DB 저장 실패 시 다음 판을 막고 마지막 회원이 나가도 정산을 재시도한다', async () => {
    results.settle.mockRejectedValueOnce(new Error('DB unavailable'));
    await lifecycle.leaving(2);
    expect(state()).toMatchObject({ status: 'ENDED', settled: false });
    await expect(service.start(1)).rejects.toMatchObject({
      response: { code: 'GAME_RESULT_PENDING' },
    });
    lifecycle.closed('123456');
    expect(store.get('123456')).toBeDefined();
    await jest.advanceTimersByTimeAsync(1000);
    expect(results.settle).toHaveBeenCalledTimes(2);
    expect(snapshots.clear).toHaveBeenCalledTimes(1);
    expect(store.get('123456')).toBeUndefined();
  });
  it('인증이 늦어져도 먼저 접수한 종 요청을 뒤 요청이 추월하지 않는다', async () => {
    const deck = new Deck([
      new Card(Fruit.STRAWBERRY, 2),
      new Card(Fruit.STRAWBERRY, 3),
      ...Array.from({ length: 6 }, () => new Card(Fruit.BANANA, 1)),
    ]);
    const game = Game.create(
      {
        gameId: 'race',
        roomCode: '123456',
        roomName: '동시 종',
        players: [
          { userId: 1, nickname: '하나' },
          { userId: 2, nickname: '둘' },
        ],
        now: Date.now(),
      },
      deck,
    );
    store.set(game);
    await service.play(1, { gameId: game.id, turnId: game.turnId });
    await service.play(2, { gameId: game.id, turnId: game.turnId });
    let verified!: () => void;
    const authorization = new Promise<void>((resolve) => {
      verified = resolve;
    });
    const input = { gameId: game.id, turnSeq: game.turnSeq };
    const first = service.bell(1, input, Date.now(), () => authorization);
    const second = service.bell(2, input, Date.now());
    verified();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(game.checkpoint().players[0].bellSuccess).toBe(1);
    expect(snapshots.claimBell).toHaveBeenCalledTimes(1);
  });

  it('모두 카드를 낸 뒤 10초 동안 종이 없으면 액션 없이도 게임을 끝내고 정산한다', async () => {
    const game = Game.create(
      {
        gameId: 'exhausted',
        roomCode: '123456',
        roomName: '카드 소진',
        players: [
          { userId: 1, nickname: '하나' },
          { userId: 2, nickname: '둘' },
        ],
        now: Date.now(),
      },
      new Deck([new Card(Fruit.BANANA, 1), new Card(Fruit.LIME, 1)]),
    );
    store.set(game);
    await service.play(1, { gameId: game.id, turnId: game.turnId });
    await service.play(2, { gameId: game.id, turnId: game.turnId });
    expect(state()).toMatchObject({ status: 'PLAYING', turnUserId: null });
    await jest.advanceTimersByTimeAsync(9999);
    expect(state().status).toBe('PLAYING');
    await jest.advanceTimersByTimeAsync(1);
    expect(state().status).toBe('ENDED');
    expect(state().results.map((player) => [player.userId, player.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(results.settle).toHaveBeenCalledTimes(1);
    expect(events.state.mock.calls.at(-1)![0]).toMatchObject({
      gameId: 'exhausted',
      status: 'ENDED',
    });
  });

  it('이탈 회원을 방에서 제거하기 전에 다음 판을 시작하지 않는다', async () => {
    let saved!: () => void;
    results.settle.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          saved = resolve;
        }),
    );
    const departure = lifecycle.leaving(2, async () => {
      room.leave(2);
    });
    const nextGame = service.start(1);
    const checked = expect(nextGame).rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
    // 큐 안의 정산 await까지 진행시킨다.
    for (let index = 0; index < 10 && !saved; index++) await Promise.resolve();
    saved();
    await departure;
    await checked;
    expect(room.snapshot().members.map((member) => member.userId)).toEqual([1]);
  });

  it('Redis 정리 실패가 남아 있으면 다음 게임이 이전 정리 재시도를 덮어쓰지 않는다', async () => {
    snapshots.clear.mockRejectedValueOnce(new Error('Cleanup unavailable'));
    await lifecycle.leaving(2);
    expect(state().settled).toBe(true);
    await expect(service.start(1)).rejects.toMatchObject({
      response: { code: 'GAME_RESULT_PENDING' },
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(snapshots.clear).toHaveBeenCalledTimes(2);
    await service.start(1);
    expect(state().status).toBe('PLAYING');
  });
});
