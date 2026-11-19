import type { RoomRole } from './domain';

/**
 * 게임 스킬(FUNC-009). 목록·등급·사용 시점·사용 역할의 원본은 노션 「자료실 ▸ 게임 스킬 (1)」이고,
 * 이 파일은 그 내용을 옮긴 것이다. 규칙(후보 뽑기·보유 칸·선택 진행)은 서버 도메인이 계산한다.
 */

/** 5라운드가 아니라 «종 성공 횟수» 기준이다(009-01). */
export const SKILL_PICK_EVERY = 5;
/** 선택 시간(009-01) */
export const SKILL_PICK_TIME_MS = 10_000;
/** 스킬을 쓰면 모두의 화면 위쪽에 사용 알림이 뜨는 시간(009-04) */
export const SKILL_CAST_MS = 1_600;
/** 손 개 쌔게 내려치기: 종 판정이 난 뒤 이 시간 안에만 쓸 수 있다 */
export const HAND_SMASH_WINDOW_MS = 2_000;
/**
 * 종 옮기기(009-05): 종이 옮겨지는 연출 0.5초 + 새 키로 치는 3초. 이동 중 처음 300ms는 종 입력을 무시한다.
 * 새 키는 방 전체가 같은 키 하나를 쓴다.
 */
export const BELL_MOVE_MS = 3_500;
export const BELL_MOVE_INPUT_LOCK_MS = 300;
export const BELL_MOVE_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'K', 'L'] as const;
/** 종이 옮겨 갈 자리 수(테이블 위 대각선 4곳) */
export const BELL_MOVE_POSITIONS = 4;
/** 시간 정지(009-05): 쓴 사람만 카드를 낼 수 있는 시간 */
export const TIME_STOP_MS = 3_000;
/** 침 뱉기(009-05): 대상 화면이 3초 가려지고 3초 흘러내린다 */
export const SPIT_COVER_MS = 3_000;
export const SPIT_DRIP_MS = 3_000;
/** 종 부수기(009-05): 종이 부서져 아무도 못 치는 시간(10~30초 중 서버가 정한다) */
export const BELL_BREAK_MIN_MS = 10_000;
export const BELL_BREAK_MAX_MS = 30_000;
/** 러시안 룰렛(009-05): 총을 맞은 사람의 테이블에서 종 밑으로 보내는 카드 수 */
export const ROULETTE_CARDS = 5;
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

/** 대상 지정: 없음(전원·나에게) 또는 플레이어 한 명(사용 뒤 좌석을 눌러 고른다) */
export type SkillTarget = 'none' | 'one';

export interface SkillDefinition {
  id: SkillId;
  name: string;
  grade: SkillGrade;
  timing: SkillTiming;
  user: SkillUser;
  target: SkillTarget;
  /**
   * 사용 효과를 구현했나. false면 선택해서 보유할 수는 있지만 쓸 수 없다(FUNC-009-05 효과 구현 중).
   * 서버가 이 값으로 사용을 거부하고 화면은 흐리게 보인다.
   */
  available: boolean;
  description: string;
}

export const SKILLS: readonly SkillDefinition[] = [
  {
    id: SkillId.BELL_MOVE,
    name: '종 옮기기',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '3초 동안 종 위치와 종 단축키가 바뀐다.',
  },
  {
    id: SkillId.SPARKLE_CARD,
    name: '반짝반짝한 카드',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '다음에 내는 카드가 금칠이 된다.',
  },
  {
    id: SkillId.SIX_FRUIT_CARD,
    name: '과일 6개 카드',
    grade: 1,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '과일이 6개인 카드를 낸다. 종 판정이 나면 바로 사라진다.',
  },
  {
    id: SkillId.NUMBER_SHIFT,
    name: '아무도 몰래 숫자 바꾸고 좋아하기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '자신의 과일 개수를 +1 한다.',
  },
  {
    id: SkillId.SPIT,
    name: '침 뱉기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.BOTH,
    target: 'one',
    available: true,
    description: '대상 한 명의 화면을 3초 동안 침으로 덮고, 3초 동안 흘러내린다.',
  },
  {
    id: SkillId.BELL_BREAK,
    name: '종 부수기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '10~30초 동안 종을 부순다. 종이 돌아올 때까지 아무도 종을 못 친다.',
  },
  {
    id: SkillId.BELL_SHELL_GAME,
    name: '종 야바위',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: false,
    description: '10초 동안 종이 3~5개로 늘어난다. 종마다 단축키가 있고 진짜는 하나뿐이다.',
  },
  {
    id: SkillId.HACK,
    name: '해킹',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'one',
    available: true,
    description: '상대방의 종 누르기 키를 바꾼다.',
  },
  {
    id: SkillId.MINE,
    name: '지뢰',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '이번 라운드에 지뢰를 깐다. 5개를 맞춰 종을 눌러도 카드가 종 밑에 쌓인다. 잘 보이지 않는다.',
  },
  {
    id: SkillId.HAND_SMASH,
    name: '손 개 쌔개 내려치기',
    grade: 3,
    timing: SkillTiming.ON_BELL,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '누군가 종을 쳐서 판정이 난 뒤 2초 안에 쓰면, 종을 먼저 친 사람의 손이 부서져 다음 판정까지 종을 못 친다.',
  },
  {
    id: SkillId.AMATERASU,
    name: '아마테라스',
    grade: 3,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'one',
    available: true,
    description: '대상 한 명을 정해 1라운드 동안 아무것도 못 하게 만든다.',
  },
  {
    id: SkillId.RAINBOW_REFLECT,
    name: '무지개 반사',
    grade: 3,
    timing: SkillTiming.AUTOMATIC,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '나를 노린 단일 지정 스킬을 자동으로 반사해, 쓴 사람이 대신 맞는다.',
  },
  {
    id: SkillId.RAT,
    name: '쥐새끼',
    grade: 3,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '쥐를 보내 종 밑에 깔린 카드를 몰래 가져온다.',
  },
  {
    id: SkillId.TIME_STOP,
    name: '시간 정지',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '3초 동안 시간이 멈춘다. 나만 카드를 낼 수 있다.',
  },
  {
    id: SkillId.DORMAMMU,
    name: '도르마무',
    grade: 4,
    timing: SkillTiming.ON_ROUND_END,
    user: SkillUser.PLAYER,
    target: 'none',
    available: false,
    description: '종을 치기 전 라운드의 카드 상태로 되돌린다.',
  },
  {
    id: SkillId.RUSSIAN_ROULETTE,
    name: '러시안 룰렛',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.SPECTATOR,
    target: 'one',
    available: true,
    description: '총을 맞은 유저는 자신이 낸 카드의 맨 위부터 5장을 종 밑에 넣는다.',
  },
  {
    id: SkillId.RESET,
    name: '안해',
    grade: 5,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: false,
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

/** 선택 진행 현황. 방 전체에 공개한다(후보·보유 스킬은 본인에게만 보낸다) */
export interface SkillPickPublic {
  /** 이 서버 시각까지 선택할 수 있다 */
  deadline: number;
  /** 게임 전체 종 성공 누적 횟수 */
  successCount: number;
  /** 몇 번째 선택인지 */
  pickNo: number;
  /** 선택을 마친 사람 수와 전체 대상 수(플레이어·관전자 모두) */
  done: number;
  total: number;
}

/** 본인에게만 보내는 스킬 상태(`game:skills`) */
export interface SkillStateEvent {
  gameId: string;
  /** 보유 스킬(최대 3개, 칸 순서대로) */
  slots: SkillId[];
  /** 해킹당했으면 Space 대신 쓰는 새 종 치기 키. 본인에게만 알린다. 다음 판정까지 */
  hackKey: string | null;
  /** 선택에 참여 중이면 후보와 내 선택 */
  pick: {
    role: RoomRole;
    candidates: SkillId[];
    /** 고른 후보 칸, 아직 안 골랐거나 받지 않았으면 null */
    candidate: number | null;
    /** 들어간 보유 칸 */
    slot: number | null;
    declined: boolean;
  } | null;
}

export interface SkillPickRequest {
  gameId: string;
  choice: SkillChoice;
}

/** 스킬 사용(009-04). `slot`은 보유 칸 번호(0~2), 대상 지정 스킬이면 `targetUserId`를 함께 보낸다 */
export interface SkillUseRequest {
  gameId: string;
  slot: number;
  targetUserId?: number;
}

/** 종 옮기기로 바뀐 종: 자리(0~3)와 새 키, 끝나는 서버 시각 */
export interface BellMovePublic {
  position: number;
  key: string;
  endsAt: number;
}

/** 시간 정지 중: 쓴 사람과 끝나는 서버 시각 */
export interface TimeStopPublic {
  userId: number;
  endsAt: number;
}

/** 종 부수기: 종이 돌아오는 서버 시각 */
export interface BellBreakPublic {
  endsAt: number;
}
