import {
  ErrorCode,
  Fruit,
  GameStatus,
  ROUND_RESULT_MS,
  SKILL_PICK_TIME_MS,
  TURN_TIME_MS,
} from '@nlmlio/shared';
import type { SkillId } from '@nlmlio/shared';
import { Card, Deck } from '../../src/domain/card/deck';
import { Game, GameRuleError } from '../../src/domain/game/game';

const card = (fruit: Fruit, count: 1 | 2 | 3 | 4 | 5) => new Card(fruit, count);
/** 1번은 딸기 2, 2번은 딸기 3을 계속 내서 두 장만 내면 언제나 정확히 5개(종 성공)가 된다. */
const alternating = (players: number, rounds = 12) =>
  new Deck(
    Array.from({ length: rounds * players }, (_, index) => {
      const seat = index % players;
      return seat === 0
        ? card(Fruit.STRAWBERRY, 2)
        : seat === 1
          ? card(Fruit.STRAWBERRY, 3)
          : card(Fruit.BANANA, 1);
    }),
  );
const start = (players = 2, random: () => number = () => 0) =>
  Game.create(
    {
      gameId: 'skill-game',
      roomCode: '123456',
      roomName: '스킬',
      players: Array.from({ length: players }, (_, index) => ({
        userId: index + 1,
        nickname: `회원${index + 1}`,
      })),
      now: 0,
    },
    alternating(players),
    random,
  );

/** 1번이 종을 쳐서 성공하는 한 라운드. 끝난 시각을 돌려준다 */
const winRound = (game: Game, from: number): number => {
  game.play(1, game.turnId, from);
  game.play(2, game.turnId, from + 1);
  const action = game.ring(1, game.turnSeq, from + 2);
  expect(action).toMatchObject({ kind: 'bell', success: true });
  return from + 2;
};
/** 성공을 `count`번 만든다. 마지막 종을 친 시각을 돌려준다 */
const succeed = (game: Game, count: number): number => {
  let at = 1000;
  let last = at;
  for (let round = 0; round < count; round++) {
    last = winRound(game, at);
    at += 10_000;
  }
  return last;
};
const expectRule = (action: () => unknown, code: ErrorCode) => {
  try {
    action();
    throw new Error('Expected rule error');
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError);
    expect((error as GameRuleError).code).toBe(code);
  }
};

describe('Game 스킬 선택 연결(FUNC-009-01)', () => {
  it('게임을 시작할 때와 종 성공 4번까지는 선택이 없다', () => {
    const game = start();
    expect(game.snapshot()).toMatchObject({ skillSuccesses: 0, skillPick: null });
    succeed(game, 4);
    expect(game.snapshot()).toMatchObject({ skillSuccesses: 4, skillPick: null });
    expect(game.skillPickOpensAt).toBeNull();
  });

  it('종 성공이 5번째면 결과 표시가 끝나는 시각에 열 차례가 된다', () => {
    const game = start();
    const ringAt = succeed(game, 5);
    expect(game.skillPickOpensAt).toBe(ringAt + ROUND_RESULT_MS);
    expect(game.snapshot().skillPick).toBeNull();
    expect(game.openSkillPick([], ringAt + ROUND_RESULT_MS - 1)).toBe(false);
    expect(game.openSkillPick([], ringAt + ROUND_RESULT_MS)).toBe(true);
    expect(game.skillPickOpensAt).toBeNull();
  });

  it('오발은 성공 횟수에 넣지 않는다', () => {
    const game = start();
    succeed(game, 4);
    // 합이 5가 아닌 상태에서 종: 딸기 2만 냈다
    game.play(1, game.turnId, 100_000);
    expect(game.ring(2, game.turnSeq, 100_001)).toMatchObject({ kind: 'bell', success: false });
    expect(game.snapshot().skillSuccesses).toBe(4);
    expect(game.skillPickOpensAt).toBeNull();
  });

  it('선택 중에는 카드 내기·종·턴 타이머가 멈추고 현황이 공개된다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    const turnId = game.turnId;
    const seq = game.turnSeq;
    game.openSkillPick([], opensAt);
    expect(game.snapshot()).toMatchObject({
      turnDeadline: null,
      skillSuccesses: 5,
      skillPick: { deadline: opensAt + SKILL_PICK_TIME_MS, pickNo: 1, done: 0, total: 2 },
    });
    expect(game.play(1, turnId, opensAt + 1)).toBeNull();
    expect(game.canRing(1, seq)).toBe(false);
    expect(game.ring(1, seq, opensAt + 2)).toBeNull();
    expect(game.timeout(turnId, opensAt + 60_000)).toBeNull();
  });

  it('전원이 고르면 바로 끝나고 멈춘 턴의 남은 시간부터 이어 간다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    const turnId = game.turnId;
    game.openSkillPick([], opensAt);
    expect(game.chooseSkill(1, { slot: 0 }, opensAt + 1000)).toBe(true);
    expect(game.snapshot().skillPick).toMatchObject({ done: 1, total: 2 });
    expect(game.turnDeadline).toBeNull();
    expect(game.chooseSkill(2, { slot: 1 }, opensAt + 3000)).toBe(true);
    expect(game.snapshot().skillPick).toBeNull();
    expect(game.turnDeadline).toBe(opensAt + 3000 + TURN_TIME_MS);
    expect(game.turnId).toBe(turnId);
    expect(game.play(1, turnId, opensAt + 3001)?.kind).toBe('card');
  });

  it('고르지 않으면 10초 뒤 서버가 처리하고 게임을 다시 진행한다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([], opensAt);
    expect(game.settleSkillPick(opensAt + SKILL_PICK_TIME_MS - 1)).toBe(false);
    expect(game.settleSkillPick(opensAt + SKILL_PICK_TIME_MS)).toBe(true);
    expect(game.skillState(1).slots).toHaveLength(1);
    expect(game.skillState(2).slots).toHaveLength(1);
    expect(game.snapshot().skillPick).toBeNull();
    expect(game.turnDeadline).toBe(opensAt + SKILL_PICK_TIME_MS + TURN_TIME_MS);
  });

  it('늦게 도착했거나 중복된 선택은 무시하고, 잘못된 선택은 거부한다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([], opensAt);
    expect(game.chooseSkill(1, { slot: 0 }, opensAt + 100)).toBe(true);
    expect(game.chooseSkill(1, { slot: 1 }, opensAt + 200)).toBe(false);
    expectRule(() => game.chooseSkill(2, { slot: 5 }, opensAt + 300), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.chooseSkill(9, { slot: 0 }, opensAt + 300), ErrorCode.NOT_IN_ROOM);
    // 마감이 지난 뒤의 선택은 조용히 무시한다. 시계는 되돌아가지 않는다.
    expect(game.chooseSkill(2, { slot: 0 }, opensAt + SKILL_PICK_TIME_MS + 1)).toBe(false);
    expect(game.skillState(2).slots).toHaveLength(0);
  });

  it('방의 관전자도 관전자용 후보를 받고, 방금 탈락한 사람도 관전자로 참여한다', () => {
    const game = start(2);
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([9, 1], opensAt);
    expect(game.snapshot().skillPick).toMatchObject({ total: 3 });
    const spectator = game.skillState(9);
    expect(spectator.pick?.role).toBe('SPECTATOR');
    const allowed: SkillId[] = ['SPIT', 'RUSSIAN_ROULETTE'];
    for (const id of spectator.pick!.candidates) expect(allowed).toContain(id);
    expect(game.skillState(1).pick?.role).toBe('PLAYER');
    expect(game.skillState(1).pick?.candidates).not.toContain('RUSSIAN_ROULETTE');
  });

  it('내 후보·내 선택은 본인 상태에만 담기고 공개 스냅샷에는 없다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([], opensAt);
    game.chooseSkill(1, { slot: 2 }, opensAt + 10);
    expect(game.skillState(1).pick).toMatchObject({ candidate: 2, slot: 0, declined: false });
    expect(game.skillState(2).pick).toMatchObject({ candidate: null, slot: null });
    expect(JSON.stringify(game.snapshot())).not.toContain('candidates');
    expect(game.skillState(9).pick).toBeNull();
  });

  it('선택이 열리기 전에 게임이 끝나면 열지 않는다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.depart(2, opensAt - 1);
    expect(game.status).toBe(GameStatus.ENDED);
    expect(game.skillPickOpensAt).toBeNull();
    expect(game.openSkillPick([], opensAt)).toBe(false);
  });

  it('선택 중에 게임이 끝나면 선택도 끝난다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([], opensAt);
    game.depart(2, opensAt + 100);
    expect(game.status).toBe(GameStatus.ENDED);
    expect(game.snapshot().skillPick).toBeNull();
    expect(game.skillPicking).toBe(false);
  });

  it('탈락·이탈한 사람의 스킬은 사라진다', () => {
    const game = start(3);
    succeed(game, 5);
    const opensAt = game.skillPickOpensAt!;
    game.openSkillPick([], opensAt);
    for (const id of [1, 2, 3]) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
    expect(game.skillState(3).slots).toHaveLength(1);
    game.depart(3, opensAt + 100);
    expect(game.skillState(3).slots).toHaveLength(0);
    expect(game.skillState(1).slots).toHaveLength(1);
  });

  it('방을 떠난 사람은 진행 중인 선택 대상에서 빠지고, 남은 사람이 모두 골랐으면 끝난다', () => {
    const game = start();
    const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
    game.openSkillPick([9], opensAt);
    game.chooseSkill(1, { slot: 0 }, opensAt + 10);
    game.chooseSkill(2, { slot: 0 }, opensAt + 10);
    expect(game.skillPicking).toBe(true);
    expect(game.releaseSkills(9, opensAt + 2000)).toBe(true);
    expect(game.skillPicking).toBe(false);
    expect(game.turnDeadline).toBe(opensAt + 2000 + TURN_TIME_MS);
    expect(game.releaseSkills(9, opensAt + 3000)).toBe(false);
  });

  it('두 번째 선택은 종 성공 10번째에 열린다', () => {
    const game = start();
    succeed(game, 5);
    const first = game.skillPickOpensAt!;
    game.openSkillPick([], first);
    game.chooseSkill(1, { slot: 0 }, first + 1);
    game.chooseSkill(2, { slot: 0 }, first + 1);
    let at = first + 20_000;
    for (let round = 0; round < 5; round++) {
      at = winRound(game, at) + 10_000;
    }
    expect(game.snapshot().skillSuccesses).toBe(10);
    expect(game.skillPickOpensAt).not.toBeNull();
    game.openSkillPick([], game.skillPickOpensAt!);
    expect(game.snapshot().skillPick).toMatchObject({ pickNo: 2 });
  });
});
