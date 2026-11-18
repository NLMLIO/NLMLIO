import {
  BELL_MOVE_KEYS,
  BELL_MOVE_MS,
  BELL_MOVE_POSITIONS,
  ErrorCode,
  Fruit,
  GameStatus,
  ROUND_RESULT_MS,
  SKILL_PICK_TIME_MS,
  TURN_TIME_MS,
} from '@nlmlio/shared';
import { SkillId, skillById } from '@nlmlio/shared';
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

/** 후보 3칸이 모두 아직 효과를 구현하지 않은 스킬(숫자 바꾸기)이 되는 난수: 등급 ⭐⭐, 그 등급의 첫째 */
const unavailableRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0.6 : 0);
};
/** 후보 3칸이 모두 반짝반짝한 카드가 되도록 등급(⭐)·스킬(둘째)을 고르는 난수 */
const sparkleRandom = () => {
  let index = 0;
  return () => (index++ % 2 === 0 ? 0 : 0.5);
};
/** 두 플레이어 모두 첫 칸에 스킬을 고르게 하고, 선택이 끝난 시각을 돌려준다 */
const holdSkills = (game: Game): number => {
  const opensAt = succeed(game, 5) + ROUND_RESULT_MS;
  game.openSkillPick([], opensAt);
  game.chooseSkill(1, { slot: 0 }, opensAt + 10);
  game.chooseSkill(2, { slot: 0 }, opensAt + 10);
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

  it('효과를 아직 구현하지 않은 스킬은 쓸 수 없고 칸에서 사라지지도 않는다', () => {
    const game = start(2, unavailableRandom());
    const at = holdSkills(game);
    expect(game.skillState(1).slots).toEqual([SkillId.NUMBER_SHIFT]);
    expectRule(() => game.useSkill(1, 0, undefined, at + 1), ErrorCode.SKILL_UNAVAILABLE);
    expect(game.skillState(1).slots).toEqual([SkillId.NUMBER_SHIFT]);
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
    const hack = skillById(SkillId.HACK);
    // 효과 구현 전이라 임시로 켜서 대상 검증만 확인한다(효과 적용 전에 거부되므로 상태는 바뀌지 않는다).
    // 난수 0.7 → 등급 ⭐⭐(50~80%), 그 등급의 다섯 번째(해킹)가 후보 3칸 모두에 나온다.
    const game = start(3, () => 0.7);
    hack.available = true;
    try {
      succeed(game, 5);
      const opensAt = game.skillPickOpensAt!;
      game.openSkillPick([], opensAt);
      expect(game.skillState(1).pick!.candidates).toEqual([
        SkillId.HACK,
        SkillId.HACK,
        SkillId.HACK,
      ]);
      for (const id of [1, 2, 3]) game.chooseSkill(id, { slot: 0 }, opensAt + 10);
      const at = opensAt + 20;
      expectRule(() => game.useSkill(1, 0, undefined, at), ErrorCode.VALIDATION_FAILED);
      expectRule(() => game.useSkill(1, 0, 1, at), ErrorCode.VALIDATION_FAILED);
      expectRule(() => game.useSkill(1, 0, 99, at), ErrorCode.VALIDATION_FAILED);
    } finally {
      hack.available = false;
    }
  });

  it('스킬 선택 중에는 쓸 수 없고(무시), 게임이 끝났으면 거부한다', () => {
    const game = start(2, sparkleRandom());
    const at = holdSkills(game);
    const ended = start(2);
    ended.depart(2, 5);
    expectRule(() => ended.useSkill(1, 0, undefined, 6), ErrorCode.GAME_ENDED);
    // 두 번째 선택이 열린 동안
    let t = at + 20_000;
    for (let round = 0; round < 5; round++) t = winRound(game, t) + 10_000;
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
    // 오발자의 카드 1장은 보관 스택으로 가고, 특수 카드(와 그 자리의 원래 카드)는 사라진다.
    expect(totalCards(game)).toBe(before - 1);
    expect(game.snapshot().players[1].topCard).not.toBeNull();
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
