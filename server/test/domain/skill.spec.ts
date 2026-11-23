import {
  ErrorCode,
  RoomRole,
  SKILLS,
  SKILL_GRADE_WEIGHT,
  SKILL_PICK_TIME_MS,
  SkillId,
  SkillUser,
  skillById,
} from '@nlmlio/shared';
import type { SkillGrade } from '@nlmlio/shared';
import { SkillBook, SkillRuleError } from '../../src/domain/skill/skill-book';
import { SkillInventory } from '../../src/domain/skill/skill-inventory';
import { gradeProbabilities, rollCandidates, skillPool } from '../../src/domain/skill/skill-roll';

/** 미리 정한 값을 차례로 돌려주는 난수. 끝나면 마지막 값을 반복한다. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};
const expectRule = (action: () => unknown, code: ErrorCode) => {
  try {
    action();
    throw new Error('Expected rule error');
  } catch (error) {
    expect(error).toBeInstanceOf(SkillRuleError);
    expect((error as SkillRuleError).code).toBe(code);
  }
};
const players = (...ids: number[]) => ids.map((userId) => ({ userId, role: RoomRole.PLAYER }));

describe('스킬 목록', () => {
  it('노션 목록의 17개이고 id가 겹치지 않는다', () => {
    expect(SKILLS).toHaveLength(17);
    expect(new Set(SKILLS.map((skill) => skill.id)).size).toBe(17);
    expect(Object.values(SkillId)).toHaveLength(17);
  });
  it('관전자 전용은 러시안 룰렛, 침 뱉기는 유저와 관전자 모두 쓴다', () => {
    expect(SKILLS.filter((skill) => skill.user === SkillUser.SPECTATOR).map((s) => s.id)).toEqual([
      SkillId.RUSSIAN_ROULETTE,
    ]);
    expect(skillById(SkillId.SPIT).user).toBe(SkillUser.BOTH);
  });
});

describe('후보 풀과 등급 확률(009-02)', () => {
  it('플레이어 풀에는 관전자 전용 스킬이 없다', () => {
    const pool = skillPool(RoomRole.PLAYER).map((skill) => skill.id);
    expect(pool).not.toContain(SkillId.RUSSIAN_ROULETTE);
    expect(pool).toContain(SkillId.SPIT);
    expect(pool).toHaveLength(16);
  });
  it('관전자 풀은 침 뱉기와 러시안 룰렛뿐이다', () => {
    expect(
      skillPool(RoomRole.SPECTATOR)
        .map((skill) => skill.id)
        .sort(),
    ).toEqual([SkillId.RUSSIAN_ROULETTE, SkillId.SPIT].sort());
  });
  it('플레이어는 기본 확률 그대로 합이 100%다', () => {
    const probabilities = gradeProbabilities(RoomRole.PLAYER);
    for (const grade of [1, 2, 3, 4, 5] as SkillGrade[])
      expect(probabilities.get(grade)).toBeCloseTo(SKILL_GRADE_WEIGHT[grade], 10);
    expect([...probabilities.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('관전자는 ⭐⭐·⭐⭐⭐⭐만 남겨 30:5 비율로 100%를 맞춘다', () => {
    const probabilities = gradeProbabilities(RoomRole.SPECTATOR);
    expect([...probabilities.keys()].sort()).toEqual([2, 4]);
    expect(probabilities.get(2)).toBeCloseTo((30 / 35) * 100, 10);
    expect(probabilities.get(4)).toBeCloseTo((5 / 35) * 100, 10);
  });
});

describe('후보 3칸 뽑기', () => {
  it('3칸을 만들고 칸마다 등급을 따로 뽑는다', () => {
    // 등급 난수 0.0→⭐, 0.6→⭐⭐(50~80), 0.999→⭐⭐⭐⭐⭐. 등급 뒤에 스킬 난수 0을 쓴다.
    const candidates = rollCandidates(RoomRole.PLAYER, sequence(0, 0, 0.6, 0, 0.999, 0));
    expect(candidates.map((id) => skillById(id).grade)).toEqual([1, 2, 5]);
  });
  it('같은 등급 안에서는 균등하게 고른다', () => {
    const first = rollCandidates(RoomRole.PLAYER, sequence(0, 0, 0, 0, 0, 0))[0];
    const last = rollCandidates(RoomRole.PLAYER, sequence(0, 0.999, 0, 0, 0, 0))[0];
    expect(first).toBe(SkillId.BELL_MOVE);
    expect(last).toBe(SkillId.SIX_FRUIT_CARD);
  });
  it('3칸에 같은 스킬이 겹쳐도 된다', () => {
    const candidates = rollCandidates(RoomRole.PLAYER, sequence(0, 0));
    expect(candidates).toEqual([SkillId.BELL_MOVE, SkillId.BELL_MOVE, SkillId.BELL_MOVE]);
  });
  it('플레이어 후보에는 러시안 룰렛이 절대 나오지 않는다', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let round = 0; round < 3000; round++)
      expect(rollCandidates(RoomRole.PLAYER, random)).not.toContain(SkillId.RUSSIAN_ROULETTE);
  });
  it('관전자 후보는 침 뱉기·러시안 룰렛 안에서만 나온다', () => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let round = 0; round < 3000; round++)
      for (const id of rollCandidates(RoomRole.SPECTATOR, random))
        expect([SkillId.SPIT, SkillId.RUSSIAN_ROULETTE]).toContain(id);
  });
  it('많이 뽑으면 등급 비율이 기본 확률에 가깝다', () => {
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const counts = new Map<number, number>();
    const rounds = 20000;
    for (let round = 0; round < rounds; round++)
      for (const id of rollCandidates(RoomRole.PLAYER, random)) {
        const grade = skillById(id).grade;
        counts.set(grade, (counts.get(grade) ?? 0) + 1);
      }
    expect(((counts.get(1) ?? 0) / (rounds * 3)) * 100).toBeGreaterThan(48);
    expect(((counts.get(1) ?? 0) / (rounds * 3)) * 100).toBeLessThan(52);
    expect(((counts.get(2) ?? 0) / (rounds * 3)) * 100).toBeGreaterThan(28);
    expect(((counts.get(2) ?? 0) / (rounds * 3)) * 100).toBeLessThan(32);
  });
});

describe('스킬 보유 칸(009-03)', () => {
  it('최대 3개까지 넣고 한 번 쓰면 사라진다', () => {
    const inventory = new SkillInventory();
    inventory.add(SkillId.HACK);
    inventory.add(SkillId.MINE);
    expect(inventory.isFull).toBe(false);
    inventory.add(SkillId.RAT);
    expect(inventory.isFull).toBe(true);
    expect(() => inventory.add(SkillId.RESET)).toThrow();
    expect(inventory.use(SkillId.MINE)).toBe(true);
    expect(inventory.list()).toEqual([SkillId.HACK, SkillId.RAT]);
    expect(inventory.use(SkillId.MINE)).toBe(false);
  });
  it('같은 스킬을 여러 개 가질 수 있고 한 개씩만 쓴다', () => {
    const inventory = new SkillInventory();
    inventory.add(SkillId.HACK);
    inventory.add(SkillId.HACK);
    inventory.use(SkillId.HACK);
    expect(inventory.list()).toEqual([SkillId.HACK]);
  });
  it('칸 번호를 지정해 교체한다', () => {
    const inventory = new SkillInventory();
    inventory.add(SkillId.HACK);
    inventory.add(SkillId.MINE);
    inventory.add(SkillId.RAT);
    inventory.replace(1, SkillId.TIME_STOP);
    expect(inventory.list()).toEqual([SkillId.HACK, SkillId.TIME_STOP, SkillId.RAT]);
    expect(() => inventory.replace(3, SkillId.RESET)).toThrow();
  });
  it('내부 배열을 밖에서 바꿀 수 없다', () => {
    const inventory = new SkillInventory();
    inventory.add(SkillId.HACK);
    inventory.list().push(SkillId.MINE);
    expect(inventory.list()).toEqual([SkillId.HACK]);
  });
});

describe('스킬 선택 시점(009-01)', () => {
  it('선택 번호는 실제로 열린 선택만 센다', () => {
    const book = new SkillBook(sequence(0));
    expect(book.pickNo).toBe(0);
    expect(book.open([], 0)).toBe(false);
    expect(book.open(players(1, 2), 0)).toBe(true);
    expect(book.pickNo).toBe(1);
    expect(() => book.open(players(1, 2), 1)).toThrow();
    book.settle(SKILL_PICK_TIME_MS);
    expect(book.open(players(1, 2), 30_000)).toBe(true);
    expect(book.pickNo).toBe(2);
  });
  it('플레이어와 관전자 모두에게 각자의 풀로 후보 3칸을 준다', () => {
    const book = new SkillBook(sequence(0));
    book.open(
      [
        { userId: 1, role: RoomRole.PLAYER },
        { userId: 2, role: RoomRole.SPECTATOR },
      ],
      0,
    );
    expect(book.selection?.candidates(1)).toHaveLength(3);
    for (const id of book.selection!.candidates(2))
      expect([SkillId.SPIT, SkillId.RUSSIAN_ROULETTE]).toContain(id);
  });
});

const open = (random: () => number, roles = players(1, 2)) => {
  const book = new SkillBook(random);
  book.open(roles, 1000);
  return book;
};

describe('스킬 고르기(009-03)', () => {
  it('후보 칸을 골라 빈 칸에 넣고, 전원이 고르면 바로 끝난다', () => {
    const book = open(sequence(0));
    book.choose(1, { slot: 0 }, 2000);
    expect(book.selection).not.toBeNull();
    expect(book.inventory(1).list()).toHaveLength(1);
    expect(book.inventory(2).list()).toHaveLength(0);
    book.choose(2, { slot: 2 }, 3000);
    expect(book.selection).toBeNull();
    expect(book.inventory(1).list()).toHaveLength(1);
    expect(book.inventory(2).list()).toHaveLength(1);
  });
  it('같은 사람이 두 번 고르면 처음 선택만 인정한다', () => {
    const book = open(sequence(0));
    book.choose(1, { slot: 0 }, 2000);
    book.choose(1, { slot: 1 }, 2100);
    book.choose(2, { slot: 0 }, 2200);
    expect(book.inventory(1).list()).toHaveLength(1);
  });
  it('선택 대상이 아니거나 후보 번호가 잘못되면 거부한다', () => {
    const book = open(sequence(0));
    expectRule(() => book.choose(9, { slot: 0 }, 2000), ErrorCode.NOT_IN_ROOM);
    expectRule(() => book.choose(1, { slot: 3 }, 2000), ErrorCode.VALIDATION_FAILED);
    expectRule(() => book.choose(1, { slot: -1 }, 2000), ErrorCode.VALIDATION_FAILED);
    expectRule(() => book.choose(1, { slot: 0, replace: 0 }, 2000), ErrorCode.VALIDATION_FAILED);
    expectRule(() => book.choose(1, { decline: true }, 2000), ErrorCode.VALIDATION_FAILED);
  });
  it('선택이 없거나 시간이 지난 뒤의 선택은 무시한다', () => {
    const book = new SkillBook(sequence(0));
    expect(() => book.choose(1, { slot: 0 }, 0)).not.toThrow();
    const opened = open(sequence(0));
    opened.choose(1, { slot: 0 }, 1000 + SKILL_PICK_TIME_MS + 1);
    expect(opened.inventory(1).list()).toHaveLength(0);
  });
  it('칸이 다 찼으면 교체할 칸을 함께 고른다', () => {
    const book = full();
    const old = book.inventory(1).list();
    expectRule(() => book.choose(1, { slot: 0 }, 2000), ErrorCode.VALIDATION_FAILED);
    expectRule(() => book.choose(1, { slot: 0, replace: 3 }, 2000), ErrorCode.VALIDATION_FAILED);
    book.choose(1, { slot: 0, replace: 1 }, 2000);
    expect(book.inventory(1).list()[0]).toBe(old[0]);
    expect(book.inventory(1).list()[1]).toBe(book.selection?.candidates(1)[0] ?? SkillId.BELL_MOVE);
    expect(book.inventory(1).list()[2]).toBe(old[2]);
  });
  it('칸이 다 찼으면 받지 않고 기존 스킬을 지킬 수 있다', () => {
    const book = full();
    const old = book.inventory(1).list();
    book.choose(1, { decline: true }, 2000);
    expect(book.inventory(1).list()).toEqual(old);
  });
});

/** 1번 플레이어의 보유 칸을 가득 채우고 세 번째 선택을 연 상태 */
function full() {
  const book = new SkillBook(sequence(0));
  for (let pick = 0; pick < 3; pick++) {
    book.open(players(1, 2), 0);
    if (pick < 2) {
      book.choose(1, { slot: 0 }, 1);
      book.choose(2, { slot: 0 }, 1);
    }
  }
  expect(book.inventory(1).list()).toHaveLength(2);
  book.choose(1, { slot: 0 }, 1);
  book.choose(2, { slot: 0 }, 1);
  // 네 번째 선택: 칸이 가득 찬 상태
  book.open(players(1, 2), 0);
  expect(book.inventory(1).isFull).toBe(true);
  return book;
}

describe('시간 초과(009-03)', () => {
  it('10초 안에 못 고르면 빈 칸이 있는 사람은 후보 중 하나가 무작위로 들어간다', () => {
    const book = open(sequence(0, 0, 0, 0, 0, 0, 0.9));
    book.choose(1, { slot: 0 }, 2000);
    expect(book.settle(1000 + SKILL_PICK_TIME_MS - 1)).toBe(false);
    expect(book.settle(1000 + SKILL_PICK_TIME_MS)).toBe(true);
    expect(book.selection).toBeNull();
    expect(book.inventory(1).list()).toHaveLength(1);
    expect(book.inventory(2).list()).toHaveLength(1);
  });
  it('칸이 가득 찬 사람은 시간이 지나면 포기로 처리해 기존 스킬을 지킨다', () => {
    const book = full();
    const old = book.inventory(1).list();
    book.settle(60_000);
    expect(book.inventory(1).list()).toEqual(old);
    expect(book.inventory(2).list()).toHaveLength(3);
  });
  it('선택이 끝난 뒤 settle은 아무 일도 하지 않는다', () => {
    const book = new SkillBook(sequence(0));
    expect(book.settle(99999)).toBe(false);
  });
});

describe('탈락·초기화(009-05)', () => {
  it('탈락·이탈하면 그 사람의 스킬이 사라지고 선택 대상에서도 빠진다', () => {
    const book = open(sequence(0));
    book.choose(2, { slot: 0 }, 2000);
    book.drop(1);
    expect(book.selection).toBeNull();
    expect(book.inventory(1).list()).toHaveLength(0);
    expect(book.inventory(2).list()).toHaveLength(1);
  });
  it('탈락해 관전자가 되면 스킬만 비우고 이후 선택에는 계속 참여한다', () => {
    const book = open(sequence(0));
    book.choose(1, { slot: 0 }, 2000);
    book.choose(2, { slot: 0 }, 2000);
    book.clear(1);
    expect(book.inventory(1).list()).toHaveLength(0);
    book.open([{ userId: 1, role: RoomRole.SPECTATOR }], 6000);
    expect(book.selection?.has(1)).toBe(true);
  });
  it('안해로 초기화하면 성공 횟수와 모든 보유 스킬·진행 중 선택이 지워진다', () => {
    const book = open(sequence(0));
    book.choose(1, { slot: 0 }, 2000);
    book.choose(2, { slot: 0 }, 2000);
    book.reset();
    expect(book.successCount).toBe(0);
    expect(book.inventory(1).list()).toHaveLength(0);
    expect(book.pickNo).toBe(0);
    expect(book.open(players(1), 0)).toBe(true);
  });
});

describe('선택 결과 기록과 열기·세기 분리(009-01·009-03)', () => {
  it('성공 횟수는 따로 세고 선택은 나중에 열 수 있다', () => {
    const book = new SkillBook(sequence(0));
    book.countSuccess();
    expect(book.successCount).toBe(1);
    expect(book.pickNo).toBe(0);
    expect(book.selection).toBeNull();
    expect(book.open(players(1, 2), 5000)).toBe(true);
    expect(book.selection?.deadline).toBe(5000 + SKILL_PICK_TIME_MS);
    expect(() => book.open(players(1), 6000)).toThrow();
  });
  it('대상이 없으면 선택을 열지 않는다', () => {
    const book = new SkillBook(sequence(0));
    for (let count = 1; count <= 5; count++) book.countSuccess();
    expect(book.open([], 0)).toBe(false);
    expect(book.selection).toBeNull();
  });
  it('고른 후보 칸과 들어간 보유 칸을 기록한다', () => {
    const book = open(sequence(0));
    const selection = book.selection!;
    expect(selection.outcome(1)).toBeNull();
    book.choose(1, { slot: 2 }, 2000);
    expect(selection.outcome(1)).toEqual({ candidate: 2, slot: 0, declined: false });
  });
  it('칸이 가득 찬 사람의 교체·포기와 시간 초과를 기록한다', () => {
    const book = full();
    const selection = book.selection!;
    book.choose(1, { slot: 1, replace: 2 }, 2000);
    expect(selection.outcome(1)).toEqual({ candidate: 1, slot: 2, declined: false });
    book.settle(60_000);
    expect(selection.outcome(2)).toEqual({ candidate: null, slot: null, declined: true });
  });
  it('시간 초과로 무작위로 들어간 스킬도 기록한다', () => {
    const book = open(sequence(0));
    const selection = book.selection!;
    book.settle(1000 + SKILL_PICK_TIME_MS);
    expect(selection.outcome(1)).toMatchObject({ declined: false, slot: 0 });
    expect(selection.outcome(1)?.candidate).not.toBeNull();
  });
  it('선택을 취소해도 보유 스킬은 그대로다', () => {
    const book = open(sequence(0));
    book.choose(1, { slot: 0 }, 2000);
    book.cancelSelection();
    expect(book.selection).toBeNull();
    expect(book.inventory(1).list()).toHaveLength(1);
  });
});
