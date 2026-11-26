import {
  BELL_BREAK_MAX_MS,
  BELL_BREAK_MIN_MS,
  BELL_MOVE_KEYS,
  BELL_MOVE_MS,
  BELL_MOVE_POSITIONS,
  ErrorCode,
  Fruit,
  GameStatus,
  ROUND_RESULT_MS,
  RAT_ESCAPE_MS,
  SKILL_PICK_TIME_MS,
  TIME_STOP_INTRO_MS,
  TIME_STOP_MS,
  TURN_TIME_MS,
} from '@nlmlio/shared';
import { SkillId } from '@nlmlio/shared';
import { Card, Deck } from '../../src/domain/card/deck';
import { Table } from '../../src/domain/game/table';
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
const start = (players = 2, random: () => number = () => 0, deck = alternating(players)) =>
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
    deck,
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
  it('게임이 시작되면 모두 역할에 맞는 첫 스킬을 고른다', () => {
    const game = start();
    expect(game.skillPickOpensAt).toBe(0);
    expect(game.openSkillPick([9], 0)).toBe(true);
    expect(game.snapshot().skillPick).toMatchObject({ pickNo: 1, total: 3 });
    expect(game.skillState(9).pick?.role).toBe('SPECTATOR');
    expect(game.turnDeadline).toBeNull();
  });

  it('오발도 한 라운드로 세고 세 번째 결과가 끝나면 두 번째 선택을 연다', () => {
    const game = start();
    holdSkills(game);
    succeed(game, 2);
    expect(game.skillPickOpensAt).toBeNull();
    game.play(1, game.turnId, 100_000);
    expect(game.ring(2, game.turnSeq, 100_001)).toMatchObject({ kind: 'bell', success: false });
    expect(game.snapshot().skillSuccesses).toBe(2);
    const opensAt = 100_001 + ROUND_RESULT_MS;
    expect(game.skillPickOpensAt).toBe(opensAt);
    expect(game.openSkillPick([], opensAt - 1)).toBe(false);
    expect(game.openSkillPick([], opensAt)).toBe(true);
    expect(game.snapshot().skillPick).toMatchObject({ pickNo: 2 });
  });

  it('선택 중에는 카드 내기·종·턴 타이머가 멈추고 현황이 공개된다', () => {
    const game = start();
    const opensAt = 0;
    const turnId = game.turnId;
    const seq = game.turnSeq;
    game.openSkillPick([], opensAt);
    expect(game.snapshot()).toMatchObject({
      turnDeadline: null,
      skillSuccesses: 0,
      skillPick: { deadline: opensAt + SKILL_PICK_TIME_MS, pickNo: 1, done: 0, total: 2 },
    });
    expect(game.play(1, turnId, opensAt + 1)).toBeNull();
    expect(game.canRing(1, seq)).toBe(false);
    expect(game.ring(1, seq, opensAt + 2)).toBeNull();
    expect(game.timeout(turnId, opensAt + 60_000)).toBeNull();
  });

  it('전원이 고르면 바로 끝나고 멈춘 턴의 남은 시간부터 이어 간다', () => {
    const game = start();
    const opensAt = 0;
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
    const opensAt = 0;
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
    const opensAt = 0;
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
    const opensAt = 0;
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
    const opensAt = 0;
    game.openSkillPick([], opensAt);
    game.chooseSkill(1, { slot: 2 }, opensAt + 10);
    expect(game.skillState(1).pick).toMatchObject({ candidate: 2, slot: 0, declined: false });
    expect(game.skillState(2).pick).toMatchObject({ candidate: null, slot: null });
    expect(JSON.stringify(game.snapshot())).not.toContain('candidates');
    expect(game.skillState(9).pick).toBeNull();
  });

  it('선택이 열리기 전에 게임이 끝나면 열지 않는다', () => {
    const game = start();
    holdSkills(game);
    const opensAt = succeed(game, 3) + ROUND_RESULT_MS;
    game.depart(2, opensAt - 1);
    expect(game.status).toBe(GameStatus.ENDED);
    expect(game.skillPickOpensAt).toBeNull();
    expect(game.openSkillPick([], opensAt)).toBe(false);
  });

  it('선택 중에 게임이 끝나면 선택도 끝난다', () => {
    const game = start();
    const opensAt = 0;
    game.openSkillPick([], opensAt);
    game.depart(2, opensAt + 100);
    expect(game.status).toBe(GameStatus.ENDED);
    expect(game.snapshot().skillPick).toBeNull();
    expect(game.skillPicking).toBe(false);
  });

  it('탈락·이탈한 사람의 스킬은 사라진다', () => {
    const game = start(3);
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
    const opensAt = 0;
    game.openSkillPick([9], opensAt);
    game.chooseSkill(1, { slot: 0 }, opensAt + 10);
    game.chooseSkill(2, { slot: 0 }, opensAt + 10);
    expect(game.skillPicking).toBe(true);
    expect(game.releaseSkills(9, opensAt + 2000)).toBe(true);
    expect(game.skillPicking).toBe(false);
    expect(game.turnDeadline).toBe(opensAt + 2000 + TURN_TIME_MS);
    expect(game.releaseSkills(9, opensAt + 3000)).toBe(false);
  });

  it('세 라운드마다 게임이 끝나지 않았으면 다시 선택한다', () => {
    const game = start();
    let at = holdSkills(game) + 10_000;
    for (const nextPick of [2, 3]) {
      for (let round = 0; round < 3; round++) {
        expect(game.skillPickOpensAt).toBeNull();
        at = winRound(game, at) + ROUND_RESULT_MS;
      }
      expect(game.skillPickOpensAt).toBe(at);
      expect(game.openSkillPick([], at)).toBe(true);
      expect(game.snapshot().skillPick).toMatchObject({ pickNo: nextPick });
      game.chooseSkill(1, { slot: 0 }, at + 1);
      game.chooseSkill(2, { slot: 0 }, at + 1);
      at += 10_000;
    }
  });
});

/** 후보 3칸이 모두 반짝반짝한 카드가 되도록 등급(⭐)·스킬(둘째)을 고르는 난수 */
const sparkleRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0 : 0.5);
};
/** 두 플레이어 모두 첫 칸에 스킬을 고르게 하고, 선택이 끝난 시각을 돌려준다 */
const holdSkills = (game: Game): number => {
  const opensAt = 0;
  game.openSkillPick([], opensAt);
  for (const id of game.userIds) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
  return opensAt + 10;
};

describe('Game 스킬 사용 틀(FUNC-009-04)', () => {
  it('쓰면 슬롯에서 사라지고 사용 알림 액션을 돌려준다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.SPARKLE_CARD]);
    const revision = game.version;
    expect(game.useSkill(1, 0, undefined, at + 1)).toEqual({
      kind: 'skill',
      userId: 1,
      skillId: SkillId.SPARKLE_CARD,
      targetUserId: null,
    });
    expect(game.skillState(1).slots).toEqual([]);
    expect(game.skillState(2).slots).toEqual([SkillId.SPARKLE_CARD]);
    expect(game.version).toBe(revision + 1);
    expectRule(() => game.useSkill(1, 0, undefined, at + 2), ErrorCode.SKILL_UNAVAILABLE);
  });

  it('반짝반짝한 카드: 다음에 내는 카드만 금칠이 되고 판정으로 옮겨지면 사라진다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    expect(game.snapshot().players[0].topCard).toMatchObject({ fruit: 'STRAWBERRY', gilded: true });
    game.play(2, game.turnId, at + 3);
    expect(game.snapshot().players[1].topCard).not.toHaveProperty('gilded');
    // 판정에 영향이 없다: 딸기 2 + 3 = 5 로 종 성공
    expect(game.ring(1, game.turnSeq, at + 4)).toMatchObject({ kind: 'bell', success: true });
    expect(game.snapshot().players[0].topCard).toBeNull();
    // 가져온 카드를 다시 내도 금칠은 없다
    game.play(1, game.turnId, at + 10_000);
    expect(game.snapshot().players[0].topCard).not.toHaveProperty('gilded');
  });

  it('금칠 예약은 한 번만 쓰인다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    game.ring(1, game.turnSeq, at + 4);
    game.play(1, game.turnId, at + 10_000);
    game.play(2, game.turnId, at + 10_001);
    expect(game.snapshot().players.map((player) => player.topCard)).not.toContainEqual(
      expect.objectContaining({ gilded: true }),
    );
  });

  it('빈 칸·잘못된 칸 번호·필요 없는 대상은 거부한다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    expectRule(() => game.useSkill(1, 1, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expectRule(() => game.useSkill(1, -1, undefined, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0.5, undefined, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, 2, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(9, 0, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(1).slots).toEqual([SkillId.SPARKLE_CARD]);
  });

  it('대상 지정 스킬은 자신·관전자·없는 사람을 대상으로 지정할 수 없다', () => {
    // 난수 0.7 → 등급 ⭐⭐(50~80%), 그 등급의 다섯 번째(해킹)가 후보 3칸 모두에 나온다.
    const game = start(3, () => 0.7);
    const opensAt = game.skillPickOpensAt!;
    game.openSkillPick([], opensAt);
    expect(game.skillState(1).pick!.candidates).toEqual([SkillId.HACK, SkillId.HACK, SkillId.HACK]);
    for (const id of [1, 2, 3]) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
    const at = opensAt + 20;
    expectRule(() => game.useSkill(1, 0, undefined, at), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, 1, at), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, 99, at), ErrorCode.VALIDATION_FAILED);
  });

  it('스킬 선택 중에는 쓸 수 없고(무시), 게임이 끝났으면 거부한다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    const ended = start(2);
    ended.depart(2, 5);
    expectRule(() => ended.useSkill(1, 0, undefined, 6), ErrorCode.GAME_ENDED);
    // 두 번째 선택이 열린 동안
    let t = at + 20_000;
    for (let round = 0; round < 3; round++) t = winRound(game, t) + 10_000;
    game.openSkillPick([], game.skillPickOpensAt!);
    expect(game.skillPicking).toBe(true);
    expect(game.useSkill(1, 0, undefined, t)).toBeNull();
    expect(game.skillState(1).slots).toEqual([SkillId.SPARKLE_CARD]);
  });
});

/** 후보가 모두 과일 6개 카드가 되는 난수(등급 ⭐, 같은 등급의 셋째) */
const sixRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0 : 0.9);
};
const totalCards = (game: Game) => {
  const state = game.checkpoint();
  return (
    state.pile.length +
    state.players.reduce((sum, player) => sum + player.hand.length + player.table.length, 0)
  );
};

describe('스킬 효과: 과일 6개 카드(FUNC-009-05)', () => {
  it('다음에 내는 카드가 같은 과일의 6개 특수 카드가 된다', () => {
    const game = start(2, sixRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.SIX_FRUIT_CARD]);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    expect(game.snapshot().players[0].topCard).toEqual({
      fruit: 'STRAWBERRY',
      count: 6,
      special: true,
    });
    game.play(2, game.turnId, at + 3);
    expect(game.snapshot().players[1].topCard).not.toHaveProperty('special');
  });

  it('딸기 합이 6 이상이라 5가 되지 못한다: 오발이면 특수 카드가 사라지고 보관 스택에도 가지 않는다', () => {
    const game = start(2, sixRandom());
    const at = holdSkills(game);
    const before = totalCards(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    // 6 + 3 = 9 이므로 5가 아니다 → 오발
    expect(game.ring(2, game.turnSeq, at + 4)).toMatchObject({ kind: 'bell', success: false });
    const state = game.checkpoint();
    expect(state.players[0].table).toEqual([]);
    expect(state.pile.some((code) => code.endsWith('*'))).toBe(false);
    // 오발자의 카드 1장은 상대에게 가고, 테이블은 모두 비워진다. 특수 카드(와 그 자리의 원래 카드)는 사라진다.
    expect(totalCards(game)).toBe(before - 1);
    expect(game.snapshot().players[1].topCard).toBeNull();
  });

  it('성공 판정이 나도 승자가 가져가지 않고 사라진다(테이블 아래 깔려 있어도)', () => {
    const game = start(2, sixRandom());
    const at = holdSkills(game);
    const before = totalCards(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2); // 6 (특수)
    game.play(2, game.turnId, at + 3); // 3
    game.play(1, game.turnId, at + 4); // 2: 특수 카드 위에 덮인다
    game.play(2, game.turnId, at + 5); // 3 → 위 카드 합 2 + 3 = 5
    const winnerHand = game.checkpoint().players[0].hand.length;
    expect(game.ring(1, game.turnSeq, at + 6)).toMatchObject({ kind: 'bell', success: true });
    const state = game.checkpoint();
    // 가져간 카드는 일반 카드 4장(2·3·2·3 중 테이블의 4장)에서 특수 카드가 빠진 3장이다.
    expect(state.players[0].hand.length).toBe(winnerHand + 3);
    expect(
      [...state.pile, ...state.players.flatMap((player) => player.hand)].some((code) =>
        code.endsWith('*'),
      ),
    ).toBe(false);
    expect(totalCards(game)).toBe(before - 1);
  });

  it('특수 카드를 내기 전에 탈락하면 예약이 사라진다', () => {
    const game = start(3, sixRandom());
    const at = holdSkills(game);
    game.useSkill(3, 0, undefined, at + 1);
    game.depart(3, at + 2);
    expect(game.skillState(3).slots).toHaveLength(0);
  });

  it('금칠과 함께 쓰면 특수 카드에 금칠이 걸린다', () => {
    const game = start(2, sixRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    expect(game.snapshot().players[0].topCard).toMatchObject({ count: 6, special: true });
  });
});

describe('스킬 효과: 종 옮기기(FUNC-009-05)', () => {
  it('모두가 같은 새 자리·새 키를 쓰는 상태를 만들고 3.5초 뒤 끝난다', () => {
    const game = start(2, () => 0);
    const at = holdSkills(game);
    expect(game.snapshot().bellMove).toBeNull();
    expect(game.useSkill(1, 0, undefined, at + 1)).toMatchObject({
      kind: 'skill',
      skillId: SkillId.BELL_MOVE,
      targetUserId: null,
    });
    const move = game.snapshot().bellMove!;
    expect(BELL_MOVE_KEYS as readonly string[]).toContain(move.key);
    expect(move.position).toBeGreaterThanOrEqual(0);
    expect(move.position).toBeLessThan(BELL_MOVE_POSITIONS);
    expect(move.endsAt).toBe(at + 1 + BELL_MOVE_MS);
    expect(game.skillState(1).slots).toEqual([]);
  });

  it('판정은 평소와 같다: 옮겨진 동안에도 서버는 같은 규칙으로 종을 판정한다', () => {
    const game = start(2, () => 0);
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    expect(game.ring(2, game.turnSeq, at + 4)).toMatchObject({ kind: 'bell', success: true });
  });

  it('다시 쓰면 새로 정해 시간을 다시 세고, 게임이 끝나면 사라진다', () => {
    const game = start(2, () => 0);
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.useSkill(2, 0, undefined, at + 2000);
    expect(game.snapshot().bellMove!.endsAt).toBe(at + 2000 + BELL_MOVE_MS);
    game.depart(2, at + 2100);
    expect(game.snapshot().bellMove).toBeNull();
  });
});

/** 등급 구간(⭐ 50 / ⭐⭐ 80 / ⭐⭐⭐ 94.5 / ⭐⭐⭐⭐ 99.5 누적)과 그 등급 안의 순번으로 원하는 스킬을 고르는 난수 */
const pickRandom = (grade: number, skill: number) => {
  let index = 0;
  return () => (index++ % 2 === 0 ? grade : skill);
};
/** 시간 정지: ⭐⭐⭐⭐ 첫째 */
const timeStopRandom = () => pickRandom(0.97, 0);
/** 아마테라스: ⭐⭐⭐ 둘째 */
const amaterasuRandom = () => pickRandom(0.9, 0.3);
/** 침 뱉기: ⭐⭐ 둘째(관전자 풀에서는 ⭐⭐의 유일한 스킬) */
const spitRandom = () => pickRandom(0.6, 0.2);

describe('스킬 효과: 시간 정지(FUNC-009-05)', () => {
  it('쓴 사람만 차례와 상관없이 카드를 계속 낼 수 있고, 다른 사람은 카드·종이 불가다', () => {
    const game = start(2, timeStopRandom());
    const at = holdSkills(game);
    expect(game.skillState(2).slots).toEqual([SkillId.TIME_STOP]);
    expect(game.snapshot().turnUserId).toBe(1);
    const deadline = game.turnDeadline!;
    game.useSkill(2, 0, undefined, at + 1);
    // 시작 연출(INTRO)이 끝난 뒤부터 5초를 센다. 연출 시간은 5초에 들어가지 않는다.
    const startsAt = at + 1 + TIME_STOP_INTRO_MS;
    const endsAt = startsAt + TIME_STOP_MS;
    expect(TIME_STOP_MS).toBe(5000);
    expect(game.snapshot().timeStop).toEqual({ userId: 2, startsAt, endsAt });
    // 시간이 흐르지 않는다: 턴 타이머가 멈춘 시간(연출 + 5초)만큼 뒤로 밀린다
    expect(game.turnDeadline).toBe(deadline + TIME_STOP_INTRO_MS + TIME_STOP_MS);
    expect(game.timeout(game.turnId, deadline + 1)).toBeNull();

    // 쓴 사람(2번)은 시작 연출 중에도, 자기 차례가 아니어도 연달아 낼 수 있다
    expect(game.play(2, game.turnId, at + 10)?.kind).toBe('card');
    expect(game.play(2, game.turnId, at + 20)?.kind).toBe('card');
    // 다른 사람은 카드도 종도 못 한다(조용히 무시)
    expect(game.play(1, game.turnId, at + 30)).toBeNull();
    expect(game.canRing(1, game.turnSeq, at + 30)).toBe(false);
    expect(game.ring(1, game.turnSeq, at + 30)).toBeNull();
    expect(game.canRing(2, game.turnSeq, at + 30)).toBe(true);
    // 연출이 끝나도 5초가 다 지나기 전에는 다른 사람은 여전히 못 한다
    expect(game.canRing(1, game.turnSeq, endsAt - 1)).toBe(false);
    // 끝나면 평소로 돌아온다
    const over = endsAt;
    expect(game.canRing(1, game.turnSeq, over)).toBe(true);
    expectRule(() => game.play(2, game.turnId, over), ErrorCode.NOT_YOUR_TURN);
    expect(game.play(1, game.turnId, over)?.kind).toBe('card');
  });

  it('쓴 사람이 탈락하거나 게임이 끝나면 풀린다', () => {
    const game = start(2, timeStopRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.depart(1, at + 2);
    expect(game.snapshot().timeStop).toBeNull();
  });
});

describe('스킬 효과: 침 뱉기(FUNC-009-05)', () => {
  it('상태는 바꾸지 않고 사용 알림만 낸다. 플레이어와 관전자 모두 쓴다', () => {
    const game = start(2, spitRandom());
    const opensAt = 0;
    game.openSkillPick([9], opensAt);
    for (const id of [1, 2, 9]) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
    expect(game.skillState(1).slots).toEqual([SkillId.SPIT]);
    expect(game.skillState(9).slots).toEqual([SkillId.SPIT]);
    const at = opensAt + 20;
    const { revision: _before, ...stateBefore } = game.snapshot();
    expect(game.useSkill(1, 0, 2, at)).toEqual({
      kind: 'skill',
      userId: 1,
      skillId: SkillId.SPIT,
      targetUserId: 2,
    });
    expect(game.useSkill(9, 0, 1, at + 1)).toEqual({
      kind: 'skill',
      userId: 9,
      skillId: SkillId.SPIT,
      targetUserId: 1,
    });
    const { revision: _after, ...stateAfter } = game.snapshot();
    expect(stateAfter).toEqual(stateBefore);
    expectRule(() => game.useSkill(9, 0, 9, at + 2), ErrorCode.SKILL_UNAVAILABLE);
  });
});

describe('스킬 효과: 아마테라스(FUNC-009-05)', () => {
  it('대상은 다음 종 판정까지 카드·종이 불가이고 차례를 건너뛴다', () => {
    const game = start(2, amaterasuRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.AMATERASU]);
    game.useSkill(1, 0, 2, at + 1);
    expect(game.snapshot().burning).toEqual([2]);
    game.play(1, game.turnId, at + 2);
    // 대상(2번)의 차례는 건너뛰고 1번이 이어서 낸다
    expect(game.snapshot().turnUserId).toBe(1);
    expect(game.ring(2, game.turnSeq, at + 3)).toBeNull();
    expect(game.canRing(2, game.turnSeq, at + 3)).toBe(false);
    game.play(1, game.turnId, at + 4);
    // 판정이 나면(여기서는 오발) 풀린다
    expect(game.ring(1, game.turnSeq, at + 5)).toMatchObject({ kind: 'bell', success: false });
    expect(game.snapshot().burning).toEqual([]);
    game.play(1, game.turnId, at + 10_000);
    expect(game.snapshot().turnUserId).toBe(2);
    expect(game.play(2, game.turnId, at + 10_001)?.kind).toBe('card');
  });

  it('대상의 차례였다면 바로 건너뛴다', () => {
    const game = start(2, amaterasuRandom());
    const at = holdSkills(game);
    game.play(1, game.turnId, at + 1);
    expect(game.snapshot().turnUserId).toBe(2);
    const turnId = game.turnId;
    game.useSkill(1, 0, 2, at + 2);
    expect(game.snapshot().turnUserId).toBe(1);
    expect(game.turnId).toBeGreaterThan(turnId);
    expect(game.snapshot().turnDeadline).toBe(at + 2 + TURN_TIME_MS);
  });

  it('자신·관전자·없는 사람은 대상이 될 수 없다', () => {
    const game = start(2, amaterasuRandom());
    const at = holdSkills(game);
    expectRule(() => game.useSkill(1, 0, 1, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, 99, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, undefined, at + 1), ErrorCode.VALIDATION_FAILED);
    expect(game.skillState(1).slots).toEqual([SkillId.AMATERASU]);
  });

  it('낼 수 있는 사람이 대상뿐이라 게임이 멈추면 풀고 차례를 돌려준다', () => {
    const game = start(2, amaterasuRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, 2, at + 1);
    // 1번이 남은 카드를 모두 내면 대상(2번)만 카드를 가진다
    let t = at + 2;
    while (game.checkpoint().players[0].hand.length > 0) game.play(1, game.turnId, (t += 1));
    expect(game.snapshot().turnUserId).toBeNull();
    expect(game.timeout(game.turnId, game.turnDeadline!)).toBeNull();
    expect(game.snapshot().burning).toEqual([]);
    expect(game.snapshot().turnUserId).toBe(2);
  });
});

/** 숫자 바꾸기: ⭐⭐ 첫째 / 종 부수기: ⭐⭐ 셋째 / 해킹: ⭐⭐ 다섯째 */
const numberShiftRandom = () => pickRandom(0.6, 0);
const bellBreakRandom = () => pickRandom(0.6, 0.4);
const hackRandom = () => pickRandom(0.6, 0.7);

describe('스킬 효과: 숫자 바꾸기(FUNC-009-05)', () => {
  it('테이블에 내 카드가 없으면 쓸 수 없고 스킬은 그대로다', () => {
    const game = start(2, numberShiftRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.NUMBER_SHIFT]);
    expectRule(() => game.useSkill(1, 0, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(1).slots).toEqual([SkillId.NUMBER_SHIFT]);
  });

  it('내 맨 위 카드의 과일 개수가 1 늘어 모두에게 보이고 판정에 쓰인다', () => {
    const game = start(2, numberShiftRandom());
    const at = holdSkills(game);
    game.play(1, game.turnId, at + 1); // 딸기 2
    game.useSkill(1, 0, undefined, at + 2);
    expect(game.snapshot().players[0].topCard).toEqual({
      fruit: 'STRAWBERRY',
      count: 3,
      boosted: true,
    });
    game.play(2, game.turnId, at + 3); // 딸기 3 → 3 + 3 = 6 이므로 5가 아니다(평소라면 성공)
    expect(game.snapshot().fruitTotals.STRAWBERRY).toBe(6);
    expect(game.ring(1, game.turnSeq, at + 4)).toMatchObject({ kind: 'bell', success: false });
    // 오발이면 테이블이 모두 종 밑으로 가므로 카드의 +1도 풀려 원래 개수로 돌아간다
    expect(game.snapshot().players[0].topCard).toBeNull();
    expect(game.checkpoint().pile).toEqual(expect.arrayContaining(['S2', 'S3']));
  });

  it('숫자가 바뀌면 지난 종 요청을 무시하고 상대도 새 테이블을 판정할 수 있다', () => {
    const deck = new Deck(Array.from({ length: 12 }, () => card(Fruit.BANANA, 4)));
    const game = start(2, numberShiftRandom(), deck);
    const at = holdSkills(game);
    game.play(1, game.turnId, at + 1);
    const before = game.turnSeq;
    game.useSkill(1, 0, undefined, at + 2);
    expect(game.turnSeq).toBe(before + 1);
    expect(game.ring(2, before, at + 3)).toBeNull();
    expect(game.ring(2, game.turnSeq, at + 4)).toMatchObject({
      kind: 'bell',
      userId: 2,
      success: true,
    });
  });

  it('카드가 테이블을 떠나면 원래 개수로 돌아오고, 한 카드에 한 번만 걸 수 있다', () => {
    const card = new Card(Fruit.BANANA, 5);
    expect(card.canBoost).toBe(true);
    card.boost();
    expect(card.count).toBe(6);
    expect(card.canBoost).toBe(false);
    expect(new Card(Fruit.BANANA, 3, true).canBoost).toBe(false);
    expect(Card.six(Fruit.LIME).canBoost).toBe(false);
    const table = new Table([1]);
    const lime = new Card(Fruit.LIME, 2);
    table.play(1, lime);
    lime.boost();
    expect(table.totals().LIME).toBe(3);
    expect(table.remove(1)).toEqual([lime]);
    expect(lime.boosted).toBe(false);
    expect(lime.count).toBe(2);
  });
});

describe('스킬 효과: 종 부수기(FUNC-009-05)', () => {
  it('5~20초 동안 아무도 종을 칠 수 없고(쓴 사람도), 카드는 낼 수 있다', () => {
    const game = start(2, bellBreakRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    const { endsAt } = game.snapshot().bellBreak!;
    expect(endsAt - (at + 1)).toBeGreaterThanOrEqual(BELL_BREAK_MIN_MS);
    expect(endsAt - (at + 1)).toBeLessThanOrEqual(BELL_BREAK_MAX_MS);
    expect((endsAt - (at + 1)) % 1000).toBe(0);
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    for (const id of [1, 2]) {
      expect(game.canRing(id, game.turnSeq, at + 4)).toBe(false);
      expect(game.ring(id, game.turnSeq, at + 4)).toBeNull();
    }
    // 돌아오면 평소와 같다: 딸기 2 + 3 = 5
    expect(game.canRing(1, game.turnSeq, endsAt)).toBe(true);
    expect(game.ring(1, game.turnSeq, endsAt)).toMatchObject({ kind: 'bell', success: true });
  });

  it('마지막 종 기회가 부서진 종 때문에 사라지지 않게 종이 돌아온 뒤로 미룬다', () => {
    const game = start(2, bellBreakRandom());
    const at = holdSkills(game);
    let t = at;
    while (game.checkpoint().players.some((player) => player.hand.length > 0))
      game.play(game.snapshot().turnUserId!, game.turnId, (t += 1));
    expect(game.snapshot().turnUserId).toBeNull();
    game.useSkill(1, 0, undefined, t + 5);
    const { endsAt } = game.snapshot().bellBreak!;
    expect(game.timeout(game.turnId, game.turnDeadline!)).toBeNull();
    expect(game.status).toBe(GameStatus.PLAYING);
    expect(game.turnDeadline).toBe(endsAt + TURN_TIME_MS);
  });

  it('게임이 끝나면 사라진다', () => {
    const game = start(2, bellBreakRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.depart(2, at + 2);
    expect(game.snapshot().bellBreak).toBeNull();
  });
});

describe('스킬 효과: 해킹(FUNC-009-05)', () => {
  it('대상에게만 무작위 새 종 키가 알려지고 공개 상태에는 없다', () => {
    const game = start(2, hackRandom());
    const at = holdSkills(game);
    expect(game.useSkill(1, 0, 2, at + 1)).toMatchObject({
      kind: 'skill',
      skillId: SkillId.HACK,
      targetUserId: 2,
    });
    const key = game.skillState(2).hackKey;
    expect(BELL_MOVE_KEYS as readonly (string | null)[]).toContain(key);
    expect(game.skillState(1).hackKey).toBeNull();
    expect(JSON.stringify(game.snapshot())).not.toContain('hackKey');
  });

  it('다음 종 판정이 나면 풀린다', () => {
    const game = start(2, hackRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, 2, at + 1);
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    expect(game.ring(1, game.turnSeq, at + 4)).toMatchObject({ success: true });
    expect(game.skillState(2).hackKey).toBeNull();
  });

  it('자신·없는 사람은 대상이 될 수 없다', () => {
    const game = start(2, hackRandom());
    const at = holdSkills(game);
    expectRule(() => game.useSkill(1, 0, 1, at + 1), ErrorCode.VALIDATION_FAILED);
    expectRule(() => game.useSkill(1, 0, 99, at + 1), ErrorCode.VALIDATION_FAILED);
    expect(game.skillState(1).slots).toEqual([SkillId.HACK]);
  });
});

/** 쥐새끼: ⭐⭐⭐ 넷째 / 러시안 룰렛(관전자 풀의 ⭐⭐⭐⭐) */
const ratRandom = () => pickRandom(0.9, 0.9);
const rouletteRandom = () => pickRandom(0.9, 0);

describe('스킬 효과: 쥐새끼(FUNC-009-05)', () => {
  it('종 밑 보관 스택 전부를 내 덱 아래로 가져온다', () => {
    const game = start(2, ratRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.RAT]);
    game.play(1, game.turnId, at + 1);
    // 오발: 테이블의 1번 카드가 종 밑 보관 스택으로 가고, 2번의 벌칙 카드 1장은 1번 덱 아래로 간다
    expect(game.ring(2, game.turnSeq, at + 2)).toMatchObject({ success: false });
    expect(game.snapshot().pileCount).toBe(1);
    const before = game.checkpoint().players[0].hand.length;
    expect(game.useSkill(1, 0, undefined, at + 3)).toMatchObject({
      kind: 'skill',
      skillId: SkillId.RAT,
      targetUserId: null,
    });
    const endsAt = at + 3 + RAT_ESCAPE_MS;
    expect(game.snapshot().rat).toEqual({ endsAt, cardCount: 1 });
    expect(game.snapshot().pileCount).toBe(1);
    expectRule(() => game.useSkill(2, 0, undefined, endsAt - 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(2).slots).toEqual([SkillId.RAT]);
    expect(game.settleRat(endsAt - 1)).toBe(false);
    expect(game.settleRat(endsAt)).toBe(true);
    expect(game.settleRat(endsAt + 1)).toBe(false);
    expect(game.snapshot().rat).toBeNull();
    expect(game.skillState(1).ratResult).toEqual({ at: endsAt, outcome: 'stolen', cardCount: 1 });
    expect(game.skillState(2).ratResult).toBeUndefined();
    expect(game.snapshot().pileCount).toBe(0);
    const hand = game.checkpoint().players[0].hand;
    expect(hand.length).toBe(before + 1);
    // 덱 맨 아래는 보관 스택에서 가져온 1번이 낸 카드다
    expect(hand.at(-1)).toBe('S2');
  });

  it.each([
    [-1, true],
    [0, false],
    [1, false],
  ] as const)(
    '쥐가 카드를 가져갈 마감의 %i ms에 종을 부수면 서버가 한 번만 판정한다',
    (delta, crushed) => {
      const game = start(2, sequenceRandom(0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.6, 0.4));
      const at = holdSkills(game);
      game.play(1, game.turnId, at + 1);
      game.ring(2, game.turnSeq, at + 2);
      game.useSkill(1, 0, undefined, at + 3);
      const count = game.snapshot().players[0].handCount;
      const end = game.ratDeadline!;
      const action = game.useSkill(2, 0, undefined, end + delta);
      expect(action).toMatchObject({ kind: 'skill', skillId: SkillId.BELL_BREAK });
      expect(action && 'ratCrushed' in action).toBe(crushed);
      expect(game.snapshot().rat).toBeNull();
      expect(game.settleRat(end + 1000)).toBe(false);
      expect(game.snapshot().players[0].handCount).toBe(count + (crushed ? 0 : 1));
      expect(game.snapshot().pileCount).toBe(crushed ? 1 : 0);
      expect(game.skillState(1).ratResult).toMatchObject({
        outcome: crushed ? 'crushed' : 'stolen',
      });
    },
  );

  it('쥐가 도착하기 전 종 승자가 보관 카드를 회수하면 쥐가 새 보관 카드를 가져가지 않는다', () => {
    const game = start(2, ratRandom());
    const at = holdSkills(game);
    game.play(1, game.turnId, at + 1);
    game.ring(2, game.turnSeq, at + 2);
    const next = at + ROUND_RESULT_MS + 10;
    game.useSkill(1, 0, undefined, next);
    game.play(2, game.turnId, next + 1);
    game.play(1, game.turnId, next + 2);
    expect(game.ring(2, game.turnSeq, next + 3)).toMatchObject({ success: true, movedCards: 3 });
    expect(game.skillState(1).ratResult).toMatchObject({ outcome: 'missed', cardCount: 1 });
    expect(game.settleRat(next + RAT_ESCAPE_MS)).toBe(false);
  });

  it('보관 스택이 비어 있으면 쓸 수 없고 스킬은 그대로다', () => {
    const game = start(2, ratRandom());
    const at = holdSkills(game);
    expect(game.snapshot().pileCount).toBe(0);
    expectRule(() => game.useSkill(1, 0, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(1).slots).toEqual([SkillId.RAT]);
  });
});

describe('스킬 효과: 러시안 룰렛(FUNC-009-05)', () => {
  const setup = (cards = 8) => {
    const game = start(2, rouletteRandom(), alternating(2, cards));
    game.openSkillPick([9], 0);
    for (const id of [1, 2, 9]) game.chooseSkill(id, { slot: 0 }, 10);
    return { game, at: 20 };
  };
  it.each([8, 3])('보유 카드 %i장에서 지정 즉시 최대 5장을 회수한다', (count) => {
    const { game, at } = setup(count);
    const lostCards = Math.min(count, 5);
    expect(game.useSkill(9, 0, 1, at)).toMatchObject({ kind: 'skill', targetUserId: 1, lostCards });
    const state = game.snapshot();
    expect(state.players.map((p) => p.handCount)).toEqual([count - lostCards, count]);
    expect(state.pileCount).toBe(lostCards);
    expect(state.turnUserId).toBe(count <= 5 ? 2 : 1);
    expectRule(() => game.useSkill(9, 0, 1, at + 1), ErrorCode.SKILL_UNAVAILABLE);
  });
  it.each([undefined, 9, 99])('유효하지 않은 대상 %s은 스킬을 소모하지 않는다', (target) => {
    const { game, at } = setup();
    expectRule(() => game.useSkill(9, 0, target, at), ErrorCode.VALIDATION_FAILED);
    expect(game.skillState(9).slots).toEqual([SkillId.RUSSIAN_ROULETTE]);
  });

  it('관전자 전용이라 플레이어는 쓸 수 없다', () => {
    const { game, at } = setup();
    expect(game.skillState(1).slots).not.toContain(SkillId.RUSSIAN_ROULETTE);
    // 플레이어는 관전자 전용 스킬을 후보로도 받지 못하므로 어떤 칸도 쓸 수 없다
    expectRule(() => game.useSkill(1, 1, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
  });
});

/** 지정한 값을 차례로 돌려주고 끝나면 마지막 값을 반복하는 난수(사람마다 후보를 다르게 줄 때 쓴다) */
const sequenceRandom = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};
/** 후보 3칸이 모두 ⭐⭐⭐ 둘째(아마테라스) / ⭐⭐⭐ 셋째(무지개 반사)가 되는 난수 6개 */
const asAmaterasu = [0.9, 0.3, 0.9, 0.3, 0.9, 0.3];
const asReflect = [0.9, 0.6, 0.9, 0.6, 0.9, 0.6];
const asSpit = [0.6, 0.2, 0.6, 0.2, 0.6, 0.2];
const asHack = [0.6, 0.7, 0.6, 0.7, 0.6, 0.7];
const asRat = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
const asMine = [0.6, 0.9, 0.6, 0.9, 0.6, 0.9];
const asHandSmash = [0.9, 0, 0.9, 0, 0.9, 0];
const mineRandom = () => pickRandom(0.6, 0.9);

describe('스킬 효과: 지뢰(FUNC-009-05)', () => {
  it('쓰면 지뢰가 깔리고, 5개를 맞춰 종을 치면 터져서 카드가 모두 종 밑으로 간다(성공도 오발도 아니다)', () => {
    const game = start(2, mineRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.MINE]);
    game.useSkill(2, 0, undefined, at + 1);
    expect(game.snapshot()).not.toHaveProperty('mine');
    const successes = game.snapshot().skillSuccesses;
    const stats = game.checkpoint().players[0];
    const hand = stats.hand.length;
    game.play(1, game.turnId, at + 2); // 딸기 2
    game.play(2, game.turnId, at + 3); // 딸기 3 → 5
    expect(game.ring(1, game.turnSeq, at + 4)).toEqual({
      kind: 'bell',
      userId: 1,
      success: false,
      movedCards: 2,
      mined: true,
      totals: expect.objectContaining({ STRAWBERRY: 5 }),
    });
    const after = game.checkpoint();
    // 승자는 카드를 가져가지 않고 종 아래 보관 스택에 쌓인다
    expect(after.pile).toHaveLength(2);
    expect(after.players[0].hand.length).toBe(hand - 1);
    expect(game.snapshot().players.map((player) => player.tableCount)).toEqual([0, 0]);
    // 성공도 오발도 아니라 기록과 성공 횟수에 넣지 않는다
    expect(after.players[0]).toMatchObject({
      bellSuccess: stats.bellSuccess,
      bellFail: stats.bellFail,
    });
    expect(game.snapshot().skillSuccesses).toBe(successes);
    // 지뢰는 사라진다
  });

  it('오발이면 터지지 않고 지뢰만 사라진다', () => {
    const game = start(2, mineRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.play(1, game.turnId, at + 2);
    expect(game.ring(2, game.turnSeq, at + 3)).toMatchObject({ success: false, movedCards: 1 });
    expect(game.ring(2, game.turnSeq, at + 3)).toBeNull();
    // 다음 판정은 평소와 같다: 지뢰가 터지지 않는다
    game.play(game.snapshot().turnUserId!, game.turnId, at + 10_000);
    game.play(game.snapshot().turnUserId!, game.turnId, at + 10_001);
    expect(game.ring(1, game.turnSeq, at + 10_002)).not.toHaveProperty('mined');
  });

  it('게임이 끝나면 사라진다', () => {
    const game = start(2, mineRandom());
    const at = holdSkills(game);
    game.useSkill(1, 0, undefined, at + 1);
    game.depart(2, at + 2);
  });
});

describe('스킬 효과: 지뢰와 쥐새끼(FUNC-009-05)', () => {
  /** 1번은 쥐새끼를, 2번은 지뢰를 든다. 보관 스택에 카드가 1장 있는 상태로 시작한다 */
  const setup = () => {
    const game = start(2, sequenceRandom(...asRat, ...asMine));
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.RAT]);
    expect(game.skillState(2).slots).toEqual([SkillId.MINE]);
    game.play(1, game.turnId, at + 1);
    expect(game.ring(2, game.turnSeq, at + 2)).toMatchObject({ success: false });
    expect(game.snapshot().pileCount).toBe(1);
    return { game, at };
  };

  it('쥐가 종 밑에 있는 2초 안에 지뢰를 깔면 쥐가 지뢰에 터져 죽고 지뢰도 사라진다', () => {
    const { game, at } = setup();
    const hand = game.checkpoint().players[0].hand.length;
    game.useSkill(1, 0, undefined, at + 3);
    expect(game.snapshot().rat).not.toBeNull();
    const action = game.useSkill(2, 0, undefined, at + 3 + RAT_ESCAPE_MS - 1);
    expect(action).toMatchObject({ kind: 'skill', skillId: SkillId.MINE, ratMined: true });
    expect(game.snapshot().ratImpact).toEqual({
      at: at + 3 + RAT_ESCAPE_MS - 1,
      outcome: 'mined',
      cardCount: 1,
    });
    expect(game.snapshot().rat).toBeNull();
    expect(game.skillState(1).ratResult).toMatchObject({ outcome: 'mined', cardCount: 1 });
    // 쥐는 카드를 가져가지 못한다
    expect(game.settleRat(at + 10_000)).toBe(false);
    expect(game.checkpoint().players[0].hand.length).toBe(hand);
    expect(game.snapshot().pileCount).toBe(1);
  });

  it('이미 지뢰가 깔려 있으면 쥐새끼를 보내자마자 쥐가 죽고 지뢰가 사라진다', () => {
    const { game, at } = setup();
    game.useSkill(2, 0, undefined, at + 3);
    const hand = game.checkpoint().players[0].hand.length;
    const action = game.useSkill(1, 0, undefined, at + 4);
    expect(action).toMatchObject({ kind: 'skill', skillId: SkillId.RAT, ratMined: true });
    expect(game.snapshot().bellGlintAt).toEqual(at + 3);
    expect(game.snapshot().ratImpact).toEqual({ at: at + 4, outcome: 'mined', cardCount: 1 });
    expect(game.snapshot().rat).toBeNull();
    expect(game.skillState(1).ratResult).toMatchObject({ outcome: 'mined' });
    expect(game.checkpoint().players[0].hand.length).toBe(hand);
    // 지뢰가 사라졌으니 다음 판정은 평소와 같다
    const next = at + 10_000;
    game.play(game.snapshot().turnUserId!, game.turnId, next);
    game.play(game.snapshot().turnUserId!, game.turnId, next + 1);
    expect(game.ring(1, game.turnSeq, next + 2)).not.toHaveProperty('mined');
  });

  it('쥐가 이미 카드를 가져간 뒤에 깐 지뢰는 쥐와 상관없이 그대로 남는다', () => {
    const { game, at } = setup();
    game.useSkill(1, 0, undefined, at + 3);
    const end = game.ratDeadline!;
    expect(game.useSkill(2, 0, undefined, end)).not.toHaveProperty('ratMined');
    expect(game.skillState(1).ratResult).toMatchObject({ outcome: 'stolen' });
  });
});

describe('스킬 효과: 무지개 반사(FUNC-009-05)', () => {
  /** 1번은 `attacker`를, 2번은 무지개 반사를 들고 시작한다 */
  const setup = (attacker: number[]) => {
    const game = start(2, sequenceRandom(...attacker, ...asReflect));
    const at = holdSkills(game);
    expect(game.skillState(2).slots).toEqual([SkillId.RAINBOW_REFLECT]);
    return { game, at };
  };
  /**
   * 세 라운드 뒤 두 번째 스킬 선택까지 마친다. 1번은 첫 칸에 `first`, 두 번째에 `secondA`를,
   * 2번은 첫 칸에 `first2`, 두 번째에 `secondB`를 든다.
   */
  const setupTwoPicks = (secondA: number[], secondB: number[]) => {
    const game = start(2, sequenceRandom(...asAmaterasu, ...asReflect, ...secondA, ...secondB));
    holdSkills(game);
    const last = succeed(game, 3);
    const opensAt = last + ROUND_RESULT_MS;
    expect(game.openSkillPick([], opensAt)).toBe(true);
    for (const id of game.userIds) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
    return { game, at: opensAt + 20 };
  };

  it('나를 노린 단일 지정 스킬을 자동으로 막고, 쓴 사람이 대신 맞는다(아마테라스)', () => {
    const { game, at } = setup(asAmaterasu);
    expect(game.skillState(1).slots).toEqual([SkillId.AMATERASU]);
    expect(game.useSkill(1, 0, 2, at + 1)).toEqual({
      kind: 'skill',
      userId: 1,
      skillId: SkillId.AMATERASU,
      targetUserId: 1,
      reflectedBy: [2],
    });
    expect(game.snapshot().burning).toEqual([1]);
    // 반사는 한 번 쓰면 사라지고, 쓴 스킬도 사라진다
    expect(game.skillState(2).slots).toEqual([]);
    expect(game.skillState(1).slots).toEqual([]);
  });

  it('침 뱉기·해킹도 쓴 사람이 대신 맞는다', () => {
    const spit = setup(asSpit);
    expect(spit.game.useSkill(1, 0, 2, spit.at + 1)).toMatchObject({
      targetUserId: 1,
      reflectedBy: [2],
    });
    const hack = setup(asHack);
    hack.game.useSkill(1, 0, 2, hack.at + 1);
    expect(hack.game.skillState(1).hackKey).not.toBeNull();
    expect(hack.game.skillState(2).hackKey).toBeNull();
  });

  it('반사된 것을 맞은 쪽도 무지개 반사가 있으면 다시 반사한다', () => {
    // 1번: 아마테라스 + 반사 / 2번: 반사 + 아마테라스 → 2번 반사 → 1번 반사 → 2번이 맞는다
    const { game, at } = setupTwoPicks(asReflect, asAmaterasu);
    expect(game.skillState(1).slots).toEqual([SkillId.AMATERASU, SkillId.RAINBOW_REFLECT]);
    expect(game.skillState(2).slots).toEqual([SkillId.RAINBOW_REFLECT, SkillId.AMATERASU]);
    expect(game.useSkill(1, 0, 2, at + 1)).toMatchObject({
      skillId: SkillId.AMATERASU,
      targetUserId: 2,
      reflectedBy: [2, 1],
    });
    expect(game.snapshot().burning).toEqual([2]);
    expect(game.skillState(1).slots).toEqual([]);
    expect(game.skillState(2).slots).toEqual([SkillId.AMATERASU]);
  });

  it('반사가 없을 때까지 주고받는다', () => {
    // 1번: 아마테라스 + 반사 / 2번: 반사 + 반사 → 2·1·2번이 차례로 반사하고 1번이 맞는다
    const { game, at } = setupTwoPicks(asReflect, asReflect);
    expect(game.useSkill(1, 0, 2, at + 1)).toMatchObject({
      targetUserId: 1,
      reflectedBy: [2, 1, 2],
    });
    expect(game.snapshot().burning).toEqual([1]);
    expect(game.skillState(1).slots).toEqual([]);
    expect(game.skillState(2).slots).toEqual([]);
  });

  it('반사를 가진 사람이 대상이 아니면 반사하지 않는다', () => {
    const game = start(2, sequenceRandom(...asAmaterasu, ...asAmaterasu));
    const at = holdSkills(game);
    // 2번이 1번을 노리는데 1번은 반사를 갖고 있지 않아 그대로 맞는다
    const action = game.useSkill(2, 0, 1, at + 1);
    expect(action).toMatchObject({ targetUserId: 1 });
    expect(action).not.toHaveProperty('reflectedBy');
    expect(game.snapshot().burning).toEqual([1]);
  });

  it('직접 쓸 수는 없다(자동으로만 발동한다)', () => {
    const { game, at } = setup(asAmaterasu);
    expectRule(() => game.useSkill(2, 0, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(2).slots).toEqual([SkillId.RAINBOW_REFLECT]);
  });

  it('손 개 쌔게 내려치기도 반사해, 내려친 사람의 손이 대신 부서진다', () => {
    // 1번은 반사를, 2번은 손 개 쌔게 내려치기를 들고 시작한다
    const game = start(2, sequenceRandom(...asReflect, ...asHandSmash));
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.RAINBOW_REFLECT]);
    expect(game.skillState(2).slots).toEqual([SkillId.HAND_SMASH]);
    game.play(1, game.turnId, at + 1);
    game.play(2, game.turnId, at + 2);
    const ringAt = at + 3;
    expect(game.ring(1, game.turnSeq, ringAt)).toMatchObject({ success: true });
    expect(game.useSkill(2, 0, undefined, ringAt + 500)).toMatchObject({
      skillId: SkillId.HAND_SMASH,
      targetUserId: 2,
      reflectedBy: [1],
    });
    expect(game.snapshot().smashed).toEqual([{ userId: 2, stage: 3 }]);
    expect(game.skillState(1).slots).toEqual([]);
  });

  it('쓴 사람이 관전자인 침 뱉기는 반사하지 않는다(관전자는 맞을 수 없다)', () => {
    const game = start(2, sequenceRandom(...asAmaterasu, ...asReflect, ...asSpit));
    const opensAt = 0;
    game.openSkillPick([9], opensAt);
    for (const id of [1, 2, 9]) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
    expect(game.skillState(9).slots).toEqual([SkillId.SPIT]);
    expect(game.useSkill(9, 0, 2, opensAt + 20)).toMatchObject({ targetUserId: 2 });
    // 반사는 그대로 남는다
    expect(game.skillState(2).slots).toEqual([SkillId.RAINBOW_REFLECT]);
  });
});

describe('스킬 효과: 손 개 쌔게 내려치기(FUNC-009-05)', () => {
  const setup = () => {
    const game = start(2, pickRandom(0.9, 0));
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.HAND_SMASH]);
    expect(game.skillState(2).slots).toEqual([SkillId.HAND_SMASH]);
    // 1번이 종을 쳐서 성공한다(딸기 2 + 3)
    game.play(1, game.turnId, at + 1);
    game.play(2, game.turnId, at + 2);
    const ringAt = at + 3;
    expect(game.ring(1, game.turnSeq, ringAt)).toMatchObject({ success: true });
    return { game, ringAt };
  };
  /** 1번이 자기 카드를 `count`장 낼 때까지 번갈아 낸다(종은 치지 않는다). 마지막 시각을 돌려준다 */
  const playOwnCards = (game: Game, count: number, from: number): number => {
    let t = from;
    let own = 0;
    while (own < count) {
      const turn = game.snapshot().turnUserId!;
      game.play(turn, game.turnId, (t += 1));
      if (turn === 1) own++;
    }
    return t;
  };

  it('종 판정이 난 2초 안에 쓰면 종을 친 사람의 손이 부서져 3단계로 시작한다', () => {
    const { game, ringAt } = setup();
    expect(game.snapshot().smashWindow).toEqual({ userId: 1, endsAt: ringAt + 2000 });
    expect(game.useSkill(2, 0, undefined, ringAt + 1500)).toMatchObject({
      kind: 'skill',
      userId: 2,
      skillId: SkillId.HAND_SMASH,
      targetUserId: 1,
    });
    expect(game.snapshot().smashed).toEqual([{ userId: 1, stage: 3 }]);
    expect(game.snapshot().smashWindow).toBeNull();
    expect(game.skillState(2).slots).toEqual([]);
  });

  it('자기 카드를 3장 낼 때마다 한 단계씩 내려가 9장을 내면 종을 칠 수 있다', () => {
    const { game, ringAt } = setup();
    game.useSkill(2, 0, undefined, ringAt + 1500);
    let t = ringAt + 5000;
    // [그 뒤 더 낸 내 카드 수, 그때 남아 있어야 할 단계]. 누적 3장마다 한 단계씩 내려간다.
    const steps: [number, 1 | 2 | 3][] = [
      [1, 3],
      [1, 3],
      [1, 2],
      [2, 2],
      [1, 1],
      [2, 1],
    ];
    for (const [more, stage] of steps) {
      t = playOwnCards(game, more, t);
      expect(game.snapshot().smashed).toEqual([{ userId: 1, stage }]);
      // 카드는 낼 수 있지만 종은 못 친다
      expect(game.canRing(1, game.turnSeq, t)).toBe(false);
      expect(game.ring(1, game.turnSeq, t)).toBeNull();
    }
    t = playOwnCards(game, 1, t); // 9장째: 풀린다
    expect(game.snapshot().smashed).toEqual([]);
    expect(game.canRing(1, game.turnSeq, t)).toBe(true);
  });

  it('종 판정이 나도 풀리지 않고 카드를 낸 수로만 회복한다', () => {
    const { game, ringAt } = setup();
    game.useSkill(2, 0, undefined, ringAt + 1500);
    let t = ringAt + 5000;
    t = playOwnCards(game, 1, t);
    game.play(game.snapshot().turnUserId!, game.turnId, (t += 1));
    // 2번이 종을 쳐서 판정이 난다(성공이든 오발이든)
    expect(game.ring(2, game.turnSeq, (t += 1))).not.toBeNull();
    expect(game.snapshot().smashed).toEqual([{ userId: 1, stage: 3 }]);
  });

  it('손이 부서진 사람이 나가면 풀린다', () => {
    const { game, ringAt } = setup();
    game.useSkill(2, 0, undefined, ringAt + 1500);
    game.depart(1, ringAt + 2000);
    expect(game.snapshot().smashed).toEqual([]);
  });

  it('2초가 지나면 쓸 수 없고, 판정을 낸 본인은 쓸 수 없다', () => {
    const { game, ringAt } = setup();
    expectRule(() => game.useSkill(1, 0, undefined, ringAt + 500), ErrorCode.SKILL_UNAVAILABLE);
    expectRule(() => game.useSkill(2, 0, undefined, ringAt + 2500), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(2).slots).toEqual([SkillId.HAND_SMASH]);
  });

  it('마지막 판정이 2초 전이 아니면 쓸 수 없고, 대상을 지정할 수 없다', () => {
    const game = start(2, pickRandom(0.9, 0));
    const at = holdSkills(game);
    expectRule(() => game.useSkill(2, 0, undefined, at + 5000), ErrorCode.SKILL_UNAVAILABLE);
    expectRule(() => game.useSkill(2, 0, 1, at + 2), ErrorCode.VALIDATION_FAILED);
  });
});

describe('스킬 효과: 종 야바위(FUNC-009-05)', () => {
  const setup = () => {
    const game = start(2, pickRandom(0.6, 0.55));
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.BELL_SHELL_GAME]);
    expect(game.useSkill(1, 0, undefined, at + 1)).toMatchObject({
      skillId: SkillId.BELL_SHELL_GAME,
    });
    game.play(1, game.turnId, at + 2);
    game.play(2, game.turnId, at + 3);
    return { game, at };
  };

  it('10초 동안 종 네 개가 숫자키 1~4와 같은 순서로 표시된다', () => {
    const { game, at } = setup();
    const shell = game.snapshot().shell!;
    expect(shell.endsAt).toBe(at + 1 + 10_000);
    expect(shell.keys).toEqual(['1', '2', '3', '4']);
    expect(JSON.stringify(game.snapshot())).not.toContain('real');
  });

  it('진짜 종은 하나뿐이다: 진짜를 누르면 평소 판정, 가짜를 누르면 오발이다', () => {
    const count = setup().game.snapshot().shell!.keys.length;
    const results = Array.from({ length: count }, (_, bell) => {
      const { game, at } = setup();
      return game.ring(1, game.turnSeq, at + 4, bell);
    });
    expect(
      results.filter((action) => action && 'success' in action && action.success),
    ).toHaveLength(1);
    for (const action of results.filter((entry) => entry && 'success' in entry && !entry.success))
      expect(action).toMatchObject({ fake: true, penaltyCards: 1 });
  });

  it('종 번호 없이 누르면 가짜로 보고, 10초가 지나면 원래대로 종 하나다', () => {
    const none = setup();
    expect(none.game.ring(1, none.game.turnSeq, none.at + 4)).toMatchObject({
      success: false,
      fake: true,
    });
    const late = setup();
    expect(late.game.ring(1, late.game.turnSeq, late.at + 12_000)).toMatchObject({
      success: true,
    });
    expect(late.game.snapshot().shell).toBeNull();
  });
});

describe('스킬 효과: 도르마무(FUNC-009-05)', () => {
  const setup = () => {
    const game = start(2, pickRandom(0.97, 0.9));
    const at = holdSkills(game);
    expect(game.skillState(2).slots).toEqual([SkillId.DORMAMMU]);
    // 도르마무가 돌아가는 곳은 종 직전이 아니라 이 라운드의 첫 카드를 내기 전이다
    const before = game.checkpoint();
    game.play(1, game.turnId, at + 1);
    game.play(2, game.turnId, at + 2);
    return { game, at, before };
  };

  it('판정 결과를 보여 주는 동안 쓰면 카드·성공 횟수가 그 라운드의 첫 카드를 내기 전으로 돌아온다', () => {
    const { game, at, before } = setup();
    const successes = game.snapshot().skillSuccesses;
    expect(game.ring(1, game.turnSeq, at + 3)).toMatchObject({ success: true });
    expect(game.snapshot().rewindUntil).toBe(at + 3 + ROUND_RESULT_MS);
    expect(game.snapshot().skillSuccesses).toBe(successes + 1);
    expect(game.useSkill(2, 0, undefined, at + 500)).toMatchObject({
      kind: 'skill',
      skillId: SkillId.DORMAMMU,
    });
    const after = game.checkpoint();
    // 낸 카드(테이블)도 모두 손으로 돌아와 아무도 카드를 내기 전 상태가 된다
    expect(after.players).toEqual(before.players);
    expect(after.players.every((player) => player.table.length === 0)).toBe(true);
    expect(after.pile).toEqual(before.pile);
    expect(after.turnUserId).toBe(before.turnUserId);
    expect(game.snapshot().skillSuccesses).toBe(successes);
    expect(game.snapshot().rewindUntil).toBeNull();
    // 되돌린 라운드에서 다시 카드를 내고 종을 칠 수 있다
    const again = at + 3 + ROUND_RESULT_MS + 10;
    game.play(1, game.turnId, again);
    game.play(2, game.turnId, again + 1);
    expect(game.ring(2, game.turnSeq, again + 2)).toMatchObject({ success: true });
  });

  it('여러 장을 낸 라운드도 그 라운드의 첫 카드를 내기 전으로 돌아간다', () => {
    const { game, at, before } = setup();
    // setup에서 1번·2번이 한 장씩 냈다. 1번이 한 장 더 내서(테이블 딸기 2+3) 종을 친다
    game.play(1, game.turnId, at + 3);
    expect(game.checkpoint().players[0].table).toHaveLength(2);
    expect(game.ring(2, game.turnSeq, at + 4)).toMatchObject({ success: true });
    expect(game.useSkill(2, 0, undefined, at + 500)).toMatchObject({ skillId: SkillId.DORMAMMU });
    const after = game.checkpoint();
    expect(after.players).toEqual(before.players);
    expect(after.pile).toEqual(before.pile);
    expect(after.turnUserId).toBe(before.turnUserId);
  });

  it('세 번째 라운드의 오발을 되감으면 예약된 선택도 취소하고 다시 판정한다', () => {
    const game = start(2, pickRandom(0.97, 0.9));
    holdSkills(game);
    succeed(game, 2);
    const at = 30_000;
    game.play(1, game.turnId, at);
    expect(game.ring(2, game.turnSeq, at + 1)).toMatchObject({ success: false });
    expect(game.skillPickOpensAt).toBe(at + 1 + ROUND_RESULT_MS);
    game.useSkill(1, 0, undefined, at + 2);
    expect(game.skillPickOpensAt).toBeNull();
    expect(game.snapshot().round).toBe(3);
    const nextBell = at + ROUND_RESULT_MS + 10;
    expect(game.ring(2, game.turnSeq, nextBell)).toMatchObject({ success: false });
    expect(game.skillPickOpensAt).toBe(nextBell + ROUND_RESULT_MS);
  });

  it('결과 표시가 끝난 뒤에는 쓸 수 없고, 쓰는 스킬도 사라지지 않는다', () => {
    const { game, at } = setup();
    game.ring(1, game.turnSeq, at + 3);
    expectRule(
      () => game.useSkill(2, 0, undefined, at + 3 + ROUND_RESULT_MS + 1),
      ErrorCode.SKILL_UNAVAILABLE,
    );
    expect(game.skillState(2).slots).toEqual([SkillId.DORMAMMU]);
  });

  it('종 판정이 한 번도 없으면 쓸 수 없다', () => {
    const { game, at } = setup();
    expectRule(() => game.useSkill(2, 0, undefined, at + 3), ErrorCode.SKILL_UNAVAILABLE);
  });
});

describe('스킬 효과: 안해(FUNC-009-05)', () => {
  /** 세 명이 카드를 한 장씩만 받아 시작하고, 1번이 빈 테이블에 종을 쳐 오발로 탈락한다 */
  const eliminateFirst = () => {
    const game = start(3, pickRandom(0.999, 0), alternating(3, 1));
    const at = holdSkills(game);
    expect(game.ring(1, game.turnSeq, at + 1)).toMatchObject({ kind: 'bell', success: false });
    expect(game.eliminatedIds).toEqual([1]);
    return { game, at: at + ROUND_RESULT_MS + 10 };
  };

  it('탈락해 관전하던 사람도 되살려 처음부터 다시 시작한다', () => {
    const { game, at } = eliminateFirst();
    expect(game.snapshot().players.map((player) => player.status)).toEqual([
      'ELIMINATED',
      'ACTIVE',
      'ACTIVE',
    ]);
    expect(game.useSkill(2, 0, undefined, at)).toMatchObject({ skillId: SkillId.RESET });
    expect(game.eliminatedIds).toEqual([]);
    expect(game.snapshot().players.map((player) => player.status)).toEqual([
      'ACTIVE',
      'ACTIVE',
      'ACTIVE',
    ]);
    // 표준 덱 56장을 세 명이 18장씩 받고 남은 2장이 종 밑에 간다
    expect(game.snapshot().players.map((player) => player.handCount)).toEqual([18, 18, 18]);
    expect(game.snapshot().pileCount).toBe(2);
    expect(game.turnUserId).toBe(1);
    // 처음 시작처럼 스킬 선택이 끝나야 카드를 낼 수 있고, 되살아난 사람도 낼 수 있다
    expect(game.play(1, game.turnId, at + 1)).toBeNull();
    game.openSkillPick([], at + 2);
    for (const id of game.userIds) game.chooseSkill(id, { slot: 0 }, at + 3);
    expect(game.play(1, game.turnId, at + 4)?.kind).toBe('card');
  });

  it('나간 사람은 되살리지 않고 제외한다', () => {
    const game = start(3, pickRandom(0.999, 0));
    const at = holdSkills(game);
    game.depart(3, at + 1);
    expect(game.eliminatedIds).toEqual([3]);
    expect(game.useSkill(2, 0, undefined, at + 2)).toMatchObject({ skillId: SkillId.RESET });
    expect(game.eliminatedIds).toEqual([3]);
    expect(game.snapshot().players.map((player) => player.status)).toEqual([
      'ACTIVE',
      'ACTIVE',
      'DEPARTED',
    ]);
    // 나간 사람을 뺀 두 명이 28장씩 받는다
    expect(game.snapshot().players.map((player) => player.handCount)).toEqual([28, 28, 0]);
  });

  it('모두의 스킬이 사라지고 처음처럼 스킬 선택을 다시 열어 하나씩 지급한다', () => {
    const { game, at } = eliminateFirst();
    game.useSkill(2, 0, undefined, at);
    for (const id of game.userIds) expect(game.skillState(id).slots).toEqual([]);
    expect(game.skillPickOpensAt).not.toBeNull();
    expect(game.openSkillPick([], at + 1)).toBe(true);
    // 되살아난 1번도 플레이어로 선택에 참여한다
    expect(game.skillState(1).pick?.role).toBe('PLAYER');
    for (const id of game.userIds) game.chooseSkill(id, { slot: 0 }, at + 10);
    for (const id of game.userIds) expect(game.skillState(id).slots).toHaveLength(1);
  });

  it('플레이 중인 사람끼리 카드를 다시 섞어 분배하고 성공 횟수·보유 스킬·기록을 모두 처음으로 돌린다', () => {
    const game = start(2, pickRandom(0.999, 0));
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.RESET]);
    expect(game.skillState(2).slots).toEqual([SkillId.RESET]);
    game.play(1, game.turnId, at + 1);
    game.play(2, game.turnId, at + 2);
    game.ring(1, game.turnSeq, at + 3);
    expect(game.snapshot().skillSuccesses).toBe(1);
    expect(game.useSkill(2, 0, undefined, at + ROUND_RESULT_MS + 4)).toMatchObject({
      kind: 'skill',
      skillId: SkillId.RESET,
    });
    const state = game.checkpoint();
    expect(game.snapshot().skillSuccesses).toBe(0);
    expect(game.skillState(1).slots).toEqual([]);
    expect(game.skillState(2).slots).toEqual([]);
    expect(state.players.every((player) => player.table.length === 0)).toBe(true);
    expect(state.players.every((player) => player.bellSuccess === 0 && player.bellFail === 0)).toBe(
      true,
    );
    // 표준 덱 56장을 2명이 28장씩 받는다
    expect(state.players.map((player) => player.hand.length)).toEqual([28, 28]);
    expect(state.pile).toHaveLength(0);
    expect(state.turnUserId).toBe(1);
    expect(state.round).toBe(1);
    expect(game.status).toBe('PLAYING');
  });
});
