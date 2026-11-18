/**
 * 게임 스킬(FUNC-009). 목록·등급·사용 시점·사용 역할의 원본은 노션 「자료실 ▸ 게임 스킬 (1)」이고,
 * 이 파일은 그 내용을 옮긴 것이다. 규칙(후보 뽑기·보유 칸·선택 진행)은 서버 도메인이 계산한다.
 */

/** 5라운드가 아니라 «종 성공 횟수» 기준이다(009-01). */
export const SKILL_PICK_EVERY = 5;
/** 선택 시간(009-01) */
export const SKILL_PICK_TIME_MS = 10_000;
/** 후보 칸 수와 보유 칸 수(009-02, 009-03) */
export const SKILL_CANDIDATE_COUNT = 3;
export const SKILL_SLOT_COUNT = 3;

export const SkillId = {
  RESET: 'RESET',
  TIME_STOP: 'TIME_STOP',
  HAND_SMASH: 'HAND_SMASH',
  BELL_MOVE: 'BELL_MOVE',
  AMATERASU: 'AMATERASU',
  NUMBER_SHIFT: 'NUMBER_SHIFT',
  SPIT: 'SPIT',
  BELL_BREAK: 'BELL_BREAK',
  RAINBOW_REFLECT: 'RAINBOW_REFLECT',
  SPARKLE_CARD: 'SPARKLE_CARD',
  BELL_SHELL_GAME: 'BELL_SHELL_GAME',
  HACK: 'HACK',
  DORMAMMU: 'DORMAMMU',
  MINE: 'MINE',
  SIX_FRUIT_CARD: 'SIX_FRUIT_CARD',
  RUSSIAN_ROULETTE: 'RUSSIAN_ROULETTE',
  RAT: 'RAT',
} as const;
export type SkillId = (typeof SkillId)[keyof typeof SkillId];

/** 별 개수(1~5). 6성은 스킬이 없어 쓰지 않는다. */
export type SkillGrade = 1 | 2 | 3 | 4 | 5;

/** 등급별 기본 등장 확률(%). 후보 풀에 스킬이 없는 등급은 빼고 합이 100%가 되게 다시 계산한다(009-02). */
export const SKILL_GRADE_WEIGHT: Record<SkillGrade, number> = {
  1: 50,
  2: 30,
  3: 14.5,
  4: 5,
  5: 0.5,
};

export const SkillTiming = {
  ANYTIME: 'ANYTIME',
  ON_OWN_TURN: 'ON_OWN_TURN',
  ON_BELL: 'ON_BELL',
  ON_ROUND_END: 'ON_ROUND_END',
  /** 사용 버튼이 없고 조건이 맞으면 자동으로 발동한다(무지개 반사) */
  AUTOMATIC: 'AUTOMATIC',
} as const;
export type SkillTiming = (typeof SkillTiming)[keyof typeof SkillTiming];

/** 누가 쓸 수 있나. 노션 「관전자 사용 여부」: 유저 / 관전자 / 유저&관전자 */
export const SkillUser = { PLAYER: 'PLAYER', SPECTATOR: 'SPECTATOR', BOTH: 'BOTH' } as const;
export type SkillUser = (typeof SkillUser)[keyof typeof SkillUser];

export interface SkillDefinition {
  id: SkillId;
  name: string;
  grade: SkillGrade;
  timing: SkillTiming;
  user: SkillUser;
  description: string;
}

export const SKILLS: readonly SkillDefinition[] = [
  {
    id: SkillId.BELL_MOVE,
    name: '종 옮기기',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '3초 동안 종 위치와 종 단축키가 바뀐다.',
  },
  {
    id: SkillId.SPARKLE_CARD,
    name: '반짝반짝한 카드',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '다음에 내는 카드가 금칠이 된다.',
  },
  {
    id: SkillId.SIX_FRUIT_CARD,
    name: '과일 6개 카드',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '과일이 6개인 카드를 낸다. 종 판정이 나면 바로 사라진다.',
  },
  {
    id: SkillId.NUMBER_SHIFT,
    name: '아무도 몰래 숫자 바꾸고 좋아하기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '자신의 과일 개수를 +1 한다.',
  },
  {
    id: SkillId.SPIT,
    name: '침 뱉기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.BOTH,
    description: '대상 한 명의 화면을 3초 동안 침으로 덮고, 3초 동안 흘러내린다.',
  },
  {
    id: SkillId.BELL_BREAK,
    name: '종 부수기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '10~30초 동안 종을 부순다. 종이 돌아올 때까지 아무도 종을 못 친다.',
  },
  {
    id: SkillId.BELL_SHELL_GAME,
    name: '종 야바위',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '10초 동안 종이 3~5개로 늘어난다. 종마다 단축키가 있고 진짜는 하나뿐이다.',
  },
  {
    id: SkillId.HACK,
    name: '해킹',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '상대방의 종 누르기 키를 바꾼다.',
  },
  {
    id: SkillId.MINE,
    name: '지뢰',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description:
      '이번 라운드에 지뢰를 깐다. 5개를 맞춰 종을 눌러도 카드가 종 밑에 쌓인다. 잘 보이지 않는다.',
  },
  {
    id: SkillId.HAND_SMASH,
    name: '손 개 쌔개 내려치기',
    grade: 3,
    timing: SkillTiming.ON_BELL,
    user: SkillUser.PLAYER,
    description:
      '누군가 종을 쳤을 때 2초 안에 쓰면, 나보다 먼저 친 사람의 손이 부서져 다음 라운드에 종을 못 친다.',
  },
  {
    id: SkillId.AMATERASU,
    name: '아마테라스',
    grade: 3,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '대상 한 명을 정해 1라운드 동안 아무것도 못 하게 만든다.',
  },
  {
    id: SkillId.RAINBOW_REFLECT,
    name: '무지개 반사',
    grade: 3,
    timing: SkillTiming.AUTOMATIC,
    user: SkillUser.PLAYER,
    description: '나를 노린 단일 지정 스킬을 자동으로 반사해, 쓴 사람이 대신 맞는다.',
  },
  {
    id: SkillId.RAT,
    name: '쥐새끼',
    grade: 3,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '쥐를 보내 종 밑에 깔린 카드를 몰래 가져온다.',
  },
  {
    id: SkillId.TIME_STOP,
    name: '시간 정지',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '3초 동안 시간이 멈춘다. 나만 카드를 낼 수 있다.',
  },
  {
    id: SkillId.DORMAMMU,
    name: '도르마무',
    grade: 4,
    timing: SkillTiming.ON_ROUND_END,
    user: SkillUser.PLAYER,
    description: '종을 치기 전 라운드의 카드 상태로 되돌린다.',
  },
  {
    id: SkillId.RUSSIAN_ROULETTE,
    name: '러시안 룰렛',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.SPECTATOR,
    description: '총을 맞은 유저는 자신이 낸 카드의 맨 위부터 5장을 종 밑에 넣는다.',
  },
  {
    id: SkillId.RESET,
    name: '안해',
    grade: 5,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    description: '게임을 처음부터 다시 시작한다.',
  },
];

export const skillById = (id: SkillId): SkillDefinition => {
  const skill = SKILLS.find((entry) => entry.id === id);
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
};

/** 선택 화면에 보내는 후보 한 칸 */
export interface SkillCandidateView {
  slot: number;
  skillId: SkillId;
}

/**
 * 스킬 선택 입력(009-03). 후보 칸을 고르거나(`slot`), 보유 칸이 가득 찼을 때 바꿀 칸(`replace`)을 함께 고르거나,
 * 받지 않는다(`decline`, 가득 찼을 때만).
 */
export type SkillChoice = { slot: number; replace?: number } | { decline: true };
