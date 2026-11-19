import { Fruit, ROUND_RESULT_MS } from '@nlmlio/shared';
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

const alternating = () =>
  new Deck(
    Array.from(
      { length: 40 },
      (_, index) => new Card(Fruit.STRAWBERRY, (index % 2 === 0 ? 2 : 3) as 2 | 3),
    ),
  );
/** 후보 3칸이 모두 반짝반짝한 카드가 되는 난수(등급 ⭐, 같은 등급의 둘째) */
const sparkleRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0 : 0.5);
};

/** 등급 구간 난수와 그 등급 안의 순번 난수를 번갈아 내는 난수 */
const pickRandom = (grade: number, skill: number) => {
  let index = 0;
  return () => (index++ % 2 === 0 ? grade : skill);
};

describe.each([
  ['반짝반짝한 카드', sparkleRandom, true, 'SPARKLE_CARD'],
  ['시간 정지', () => pickRandom(0.97, 0), true, 'TIME_STOP'],
  ['지뢰(효과 미구현)', () => pickRandom(0.6, 0.9), false, 'MINE'],
])('GameService 스킬 사용 — %s (FUNC-009-04)', (_name, makeRandom, usable, skillId) => {
  let service: GameService;
  let timers: GameTimers;
  let events: { state: jest.Mock; action: jest.Mock; sync: jest.Mock; skills: jest.Mock };
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date('2026-11-19T00:00:00Z') });
    const room = Room.create({
      code: '123456',
      name: '스킬',
      host: { userId: 1, nickname: '하나' },
    });
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
    service = new GameService(
      rooms as unknown as RoomService,
      new RoomGameLifecycle(),
      new GameStore(),
      new RoomQueue(),
      { create: (input) => Game.create(input, alternating(), makeRandom()) } as GameFactory,
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
  const round = async () => {
    const gameId = state().gameId;
    await service.play(1, { gameId, turnId: state().turnId });
    await service.play(2, { gameId, turnId: state().turnId });
    await service.bell(1, { gameId, turnSeq: state().turnSeq });
    await jest.advanceTimersByTimeAsync(ROUND_RESULT_MS + 100);
  };
  /** 종 성공 5번 → 선택에서 둘 다 첫 후보를 고른다 */
  const hold = async () => {
    for (let index = 0; index < 5; index++) await round();
    const { gameId } = state();
    await service.pickSkill(1, { gameId, choice: { slot: 0 } });
    await service.pickSkill(2, { gameId, choice: { slot: 0 } });
    return gameId;
  };

  it('선택 중에는 쓸 수 없다(무시)', async () => {
    for (let index = 0; index < 5; index++) await round();
    expect(state().skillPick).not.toBeNull();
    expect(await service.useSkill(1, { gameId: state().gameId, slot: 0 })).toBe(false);
  });

  it(
    usable
      ? '쓰면 방 전체에 사용 알림을 보내고 슬롯에서 사라진다'
      : '쓸 수 없는 스킬은 거부하고 슬롯에 그대로 남는다',
    async () => {
      const gameId = await hold();
      expect(service.skillsFor(1)!.slots).toHaveLength(1);
      events.action.mockClear();
      events.skills.mockClear();
      if (!usable) {
        await expect(service.useSkill(1, { gameId, slot: 0 })).rejects.toMatchObject({
          response: { code: 'SKILL_UNAVAILABLE' },
        });
        expect(service.skillsFor(1)!.slots).toHaveLength(1);
        expect(events.action).not.toHaveBeenCalled();
        return;
      }
      expect(await service.useSkill(1, { gameId, slot: 0 })).toBe(true);
      expect(events.action).toHaveBeenCalledWith(
        '123456',
        expect.objectContaining({
          kind: 'skill',
          userId: 1,
          skillId,
          targetUserId: null,
        }),
      );
      expect(service.skillsFor(1)!.slots).toHaveLength(0);
      // 쓴 사람의 슬롯만 다시 보낸다
      expect(events.skills.mock.calls.map(([id]) => id)).toEqual([1]);
      expect(service.skillsFor(2)!.slots).toHaveLength(1);
    },
  );

  it('남이 만든 gameId·없는 게임에는 쓸 수 없다', async () => {
    await hold();
    await expect(service.useSkill(1, { gameId: 'previous', slot: 0 })).rejects.toMatchObject({
      response: { code: 'GAME_NOT_FOUND' },
    });
  });

  if (skillId === 'TIME_STOP')
    it('시간 정지 중에는 쓴 사람만 카드를 내고 다른 사람의 카드·종은 서비스에서 무시한다', async () => {
      const gameId = await hold();
      // 2번(차례가 아닌 사람)이 시간을 멈춘다
      expect(await service.useSkill(2, { gameId, slot: 0 })).toBe(true);
      expect(state().timeStop).toMatchObject({ userId: 2 });
      expect(await service.play(1, { gameId, turnId: state().turnId })).toBe(false);
      expect(await service.bell(1, { gameId, turnSeq: state().turnSeq })).toBe(false);
      expect(await service.play(2, { gameId, turnId: state().turnId })).toBe(true);
      expect(await service.play(2, { gameId, turnId: state().turnId })).toBe(true);
      // 3초가 지나면 평소로 돌아온다
      await jest.advanceTimersByTimeAsync(3000);
      expect(await service.play(1, { gameId, turnId: state().turnId })).toBe(true);
    });
});
