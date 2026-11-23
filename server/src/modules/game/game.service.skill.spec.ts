import {
  Fruit,
  RAT_ESCAPE_MS,
  ROUND_RESULT_MS,
  SKILL_PICK_TIME_MS,
  TURN_TIME_MS,
} from '@nlmlio/shared';
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

/** 1번은 딸기 2, 2번은 딸기 3만 내서 두 장이면 언제나 종 성공이 된다 */
const alternating = () =>
  new Deck(
    Array.from(
      { length: 40 },
      (_, index) => new Card(Fruit.STRAWBERRY, (index % 2 === 0 ? 2 : 3) as 2 | 3),
    ),
  );

describe('GameService 스킬 선택(FUNC-009-01·003)', () => {
  let service: GameService;
  let timers: GameTimers;
  let room: Room;
  let lifecycle: RoomGameLifecycle;
  let events: { state: jest.Mock; action: jest.Mock; sync: jest.Mock; skills: jest.Mock };
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date('2026-11-19T00:00:00Z') });
    room = Room.create({ code: '123456', name: '스킬', host: { userId: 1, nickname: '하나' } });
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
    events = { state: jest.fn(), action: jest.fn(), sync: jest.fn(), skills: jest.fn() };
    timers = new GameTimers();
    lifecycle = new RoomGameLifecycle();
    service = new GameService(
      rooms as unknown as RoomService,
      lifecycle,
      new GameStore(),
      new RoomQueue(),
      { create: (input) => Game.create(input, alternating(), () => 0.9) } as GameFactory,
      {
        save: jest.fn().mockResolvedValue(undefined),
        claimBell: jest.fn().mockResolvedValue(true),
        clear: jest.fn().mockResolvedValue(undefined),
      } as unknown as GameStateRepository,
      { settle: jest.fn().mockResolvedValue({ saved: true }) } as unknown as GameResultService,
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
  /** 1번이 종을 쳐서 성공하는 한 라운드를 끝내고 결과 표시 시간을 기다린다 */
  const round = async () => {
    const gameId = state().gameId;
    await service.play(1, { gameId, turnId: state().turnId });
    await service.play(2, { gameId, turnId: state().turnId });
    await service.bell(1, { gameId, turnSeq: state().turnSeq });
    await jest.advanceTimersByTimeAsync(ROUND_RESULT_MS + 100);
  };
  const succeed = async (count: number) => {
    for (let index = 0; index < count; index++) await round();
  };

  const finishInitial = async () => {
    for (const id of [1, 2])
      await service.pickSkill(id, { gameId: state().gameId, choice: { slot: 0 } });
  };

  it('시작 스킬을 고른 뒤 두 라운드까지는 다시 열리지 않는다', async () => {
    expect(state().skillPick).toMatchObject({ pickNo: 1, done: 0, total: 2 });
    await finishInitial();
    await succeed(2);
    expect(state()).toMatchObject({ skillSuccesses: 2, skillPick: null });
  });

  it('세 번째 라운드의 판정 화면이 끝나면 다음 선택을 열고 본인에게 후보를 보낸다', async () => {
    await finishInitial();
    const gameId = state().gameId;
    await succeed(2);
    await service.play(1, { gameId, turnId: state().turnId });
    await service.play(2, { gameId, turnId: state().turnId });
    await service.bell(1, { gameId, turnSeq: state().turnSeq });
    await jest.advanceTimersByTimeAsync(ROUND_RESULT_MS - 1);
    expect(state().skillPick).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(state().skillPick).toMatchObject({ pickNo: 2, done: 0, total: 2 });
    expect(state().turnDeadline).toBeNull();
    const mine = events.skills.mock.calls.filter(([id]) => id === 1).at(-1)![1];
    expect(mine.pick.candidates).toHaveLength(3);
    expect(mine.pick.role).toBe('PLAYER');
  });

  it('선택 중에는 카드 내기가 무시되고 턴 타이머가 멈춘다', async () => {
    const before = state();
    expect(before.skillPick).not.toBeNull();
    expect(await service.play(1, { gameId: before.gameId, turnId: before.turnId })).toBe(false);
    await jest.advanceTimersByTimeAsync(SKILL_PICK_TIME_MS - 500);
    expect(state().turnSeq).toBe(before.turnSeq);
    expect(state().skillPick).not.toBeNull();
  });

  it('전원이 고르면 바로 끝나고 멈춘 턴 시간부터 이어 간다', async () => {
    const { gameId, turnSeq } = state();
    await jest.advanceTimersByTimeAsync(3000);
    expect(await service.pickSkill(1, { gameId, choice: { slot: 0 } })).toBe(true);
    expect(state().skillPick).toMatchObject({ done: 1, total: 2 });
    expect(await service.pickSkill(1, { gameId, choice: { slot: 1 } })).toBe(false);
    expect(await service.pickSkill(2, { gameId, choice: { slot: 2 } })).toBe(true);
    expect(state().skillPick).toBeNull();
    expect(state().turnDeadline).toBeGreaterThan(Date.now());
    expect(service.skillsFor(1)!.slots).toHaveLength(1);
    // 멈췄던 10초가 다시 흐른다: 아직 자동 내기 전
    await jest.advanceTimersByTimeAsync(TURN_TIME_MS - 100);
    expect(state().turnSeq).toBe(turnSeq);
    await jest.advanceTimersByTimeAsync(200);
    expect(state().turnSeq).toBe(turnSeq + 1);
  });

  it('10초 안에 못 고르면 서버가 처리하고 게임이 다시 진행된다', async () => {
    const { turnSeq } = state();
    await jest.advanceTimersByTimeAsync(SKILL_PICK_TIME_MS);
    expect(state().skillPick).toBeNull();
    expect(service.skillsFor(1)!.slots).toHaveLength(1);
    expect(service.skillsFor(2)!.slots).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(TURN_TIME_MS + 100);
    expect(state().turnSeq).toBe(turnSeq + 1);
  });

  it('도중에 들어온 관전자도 관전자용 후보로 선택에 참여한다', async () => {
    room.join({ userId: 3, nickname: '관전' });
    await finishInitial();
    await succeed(3);
    expect(state().skillPick).toMatchObject({ total: 3 });
    const spectator = events.skills.mock.calls.filter(([id]) => id === 3).at(-1)![1];
    expect(spectator.pick.role).toBe('SPECTATOR');
    for (const id of spectator.pick.candidates) expect(['SPIT', 'RUSSIAN_ROULETTE']).toContain(id);
  });

  it('후보·내 선택은 본인에게만 가고, 바뀐 사람에게만 다시 보낸다', async () => {
    const { gameId } = state();
    events.skills.mockClear();
    await service.pickSkill(1, { gameId, choice: { slot: 0 } });
    const receivers = events.skills.mock.calls.map(([id]) => id);
    expect(receivers).toEqual([1]);
    expect(JSON.stringify(events.state.mock.calls.at(-1))).not.toContain('candidates');
  });

  it('선택 중에 방을 나가면 대상에서 빠지고 남은 사람이 모두 골랐다면 끝난다', async () => {
    room.join({ userId: 3, nickname: '관전' });
    await finishInitial();
    await succeed(3);
    const { gameId } = state();
    await service.pickSkill(1, { gameId, choice: { slot: 0 } });
    await service.pickSkill(2, { gameId, choice: { slot: 0 } });
    expect(state().skillPick).toMatchObject({ done: 2, total: 3 });
    await lifecycle.leaving(3);
    expect(state().skillPick).toBeNull();
  });

  it('쥐는 추가 입력이 없어도 서버 타이머에 맞춰 카드를 가져가고 소유자에게만 결과가 간다', async () => {
    await finishInitial();
    const { gameId, turnId } = state();
    await service.play(1, { gameId, turnId });
    await service.bell(2, { gameId, turnSeq: state().turnSeq });
    await service.useSkill(1, { gameId, slot: 0 });
    expect(state().rat).toEqual({ endsAt: Date.now() + RAT_ESCAPE_MS, cardCount: 1 });
    events.skills.mockClear();
    await jest.advanceTimersByTimeAsync(RAT_ESCAPE_MS - 1);
    expect(state().pileCount).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(state()).toMatchObject({ rat: null, pileCount: 0 });
    expect(events.skills.mock.calls.map(([id]) => id)).toEqual([1]);
    expect(service.skillsFor(1)?.ratResult?.outcome).toBe('stolen');
  });

  it('게임이 끝나면 선택 타이머를 취소한다', async () => {
    await lifecycle.leaving(2);
    expect(state().status).toBe('ENDED');
    expect(state().skillPick).toBeNull();
    const actions = events.state.mock.calls.length;
    await jest.advanceTimersByTimeAsync(SKILL_PICK_TIME_MS * 2);
    expect(events.state).toHaveBeenCalledTimes(actions);
  });
});
