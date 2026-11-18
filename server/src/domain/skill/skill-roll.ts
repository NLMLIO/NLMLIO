import {
  RoomRole,
  SKILLS,
  SKILL_CANDIDATE_COUNT,
  SKILL_GRADE_WEIGHT,
  SkillUser,
} from '@nlmlio/shared';
import type { SkillDefinition, SkillGrade, SkillId } from '@nlmlio/shared';

/** [0, 1) 난수. 서버가 정하고, 테스트에서는 값을 고정해 넣는다. */
export type Random = () => number;

const GRADES: readonly SkillGrade[] = [1, 2, 3, 4, 5];

/** 이 역할이 후보로 받을 수 있는 스킬. 쓸 수 없는 스킬은 후보로 만들지 않는다. */
export const skillPool = (role: RoomRole): SkillDefinition[] =>
  SKILLS.filter(
    (skill) =>
      skill.user === SkillUser.BOTH ||
      skill.user === (role === RoomRole.PLAYER ? SkillUser.PLAYER : SkillUser.SPECTATOR),
  );

/**
 * 풀에 스킬이 있는 등급만 남기고, 기본 확률의 비율을 유지한 채 합이 100%가 되도록 다시 계산한다.
 * 반환값은 등급 오름차순 Map(등급 → %)이다.
 */
export const gradeProbabilities = (role: RoomRole): Map<SkillGrade, number> => {
  const present = new Set(skillPool(role).map((skill) => skill.grade));
  const grades = GRADES.filter((grade) => present.has(grade));
  const total = grades.reduce((sum, grade) => sum + SKILL_GRADE_WEIGHT[grade], 0);
  return new Map(grades.map((grade) => [grade, (SKILL_GRADE_WEIGHT[grade] / total) * 100]));
};

const index = (random: Random, size: number): number =>
  Math.min(Math.floor(random() * size), size - 1);

/** 후보 한 칸: 등급을 확률대로 뽑고, 그 등급의 스킬 중에서 균등하게 하나를 고른다. */
const rollOne = (role: RoomRole, random: Random): SkillId => {
  const entries = [...gradeProbabilities(role)];
  const point = random() * 100;
  let acc = 0;
  let grade = entries[entries.length - 1][0];
  for (const [candidate, percent] of entries) {
    acc += percent;
    if (point < acc) {
      grade = candidate;
      break;
    }
  }
  const sameGrade = skillPool(role).filter((skill) => skill.grade === grade);
  return sameGrade[index(random, sameGrade.length)].id;
};

/** 칸마다 등급을 따로 굴린다. 3칸에 같은 스킬이 겹쳐도 된다(009-02). */
export const rollCandidates = (
  role: RoomRole,
  random: Random,
  count = SKILL_CANDIDATE_COUNT,
): SkillId[] => Array.from({ length: count }, () => rollOne(role, random));

export const pickIndex = index;
