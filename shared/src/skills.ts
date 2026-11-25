import type { RoomRole } from './domain';

/**
 * 게임 스킬(FUNC-009). 목록·등급·사용 시점·사용 역할의 원본은 노션 「자료실 ▸ 게임 스킬 (1)」이고,
 * 이 파일은 그 내용을 옮긴 것이다. 규칙(후보 뽑기·보유 칸·선택 진행)은 서버 도메인이 계산한다.
 */

/** 시작 스킬을 고른 뒤, 이만큼 라운드가 끝날 때마다 다시 고른다(009-01). */
export const SKILL_PICK_EVERY = 3;
/** 선택 시간(009-01) */
export const SKILL_PICK_TIME_MS = 10_000;
/** 스킬 사용 알림이 수신자의 화면 위쪽에 뜨는 시간(009-04) */
export const SKILL_CAST_MS = 1_600;
/** 손 개 쌔게 내려치기: 종 판정이 난 뒤 이 시간 안에만 쓸 수 있다 */
export const HAND_SMASH_WINDOW_MS = 2_000;
/** 맞은 손이 회복하는 단계 수와, 한 단계를 내려가는 데 필요한 자기 카드 수(3단계 × 3장 = 9장) */
export const HAND_SMASH_STAGES = 3;
export const HAND_SMASH_CARDS_PER_STAGE = 3;
/** 종 야바위가 이어지는 시간과 늘어나는 종의 개수 */
export const BELL_SHELL_MS = 10_000;
export const BELL_SHELL_KEYS = ['1', '2', '3', '4'] as const;
/**
 * 종 옮기기(009-05): 종이 옮겨지는 연출 0.5초 + 새 키로 치는 3초. 이동 중 처음 300ms는 종 입력을 무시한다.
 * 새 키는 방 전체가 같은 키 하나를 쓴다.
 */
export const BELL_MOVE_MS = 3_500;
export const BELL_MOVE_INPUT_LOCK_MS = 300;
export const BELL_MOVE_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'K', 'L'] as const;
/** 종이 옮겨 갈 자리 수(테이블 위 대각선 4곳) */
export const BELL_MOVE_POSITIONS = 4;
/** 시간 정지(009-05): 쓴 사람만 카드를 낼 수 있는 시간. 시작 연출 시간은 여기에 들어가지 않는다 */
export const TIME_STOP_MS = 5_000;
/** 시간 정지 시작 연출(시계가 멈추는 애니메이션). 이 동안에도 시간은 멈춰 있고 쓴 사람은 카드를 낼 수 있다 */
export const TIME_STOP_INTRO_MS = 1_100;
/** 침 뱉기(009-05): 대상 화면이 3초 가려지고 3초 흘러내린다 */
export const SPIT_COVER_MS = 3_000;
export const SPIT_DRIP_MS = 3_000;
/** 종 부수기(009-05): 종이 부서져 아무도 못 치는 시간(5~20초 중 서버가 정한다) */
export const BELL_BREAK_MIN_MS = 5_000;
export const BELL_BREAK_MAX_MS = 20_000;
/**
 * 러시안 룰렛(009-05): 종 위에 올려 둔 리볼버의 공포탄·실탄 수. 종을 누를 때마다 남은 칸 중 하나가 나오고,
 * 공포탄이면 그 칸만 줄고 실탄이면 테이블 카드가 종 아래로 가고 리볼버가 사라진다.
 */
export const ROULETTE_BLANKS = 5;
export const ROULETTE_LIVE = 1;
/** 쥐가 종 아래에 나타난 뒤 카드를 가져갈 때까지의 시간(이 안에 지뢰를 깔아도 쥐가 죽는다) */
export const RAT_ESCAPE_MS = 2_000;
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
   * 필드는 방 전체, 개인은 시전자·피격자·반사자, hidden은 설치 알림을 보내지 않는다.
   * 대상을 지정하는 스킬(침 뱉기·해킹·아마테라스·손 내려치기)은 모두가 연출을 보도록 필드로 보낸다.
   */
  announcement: 'field' | 'personal' | 'hidden';
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
    announcement: 'field',
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
    announcement: 'personal',
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
    announcement: 'personal',
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
    announcement: 'personal',
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
    announcement: 'field',
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
    announcement: 'field',
    name: '종 부수기',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '5~20초 동안 종을 부순다. 종이 돌아올 때까지 아무도 종을 못 친다. 종 아래에 있는 쥐도 잡는다.',
  },
  {
    id: SkillId.BELL_SHELL_GAME,
    announcement: 'field',
    name: '종 야바위',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '10초 동안 종이 4개로 늘어난다. 숫자키 1~4로 선택하며 진짜는 하나뿐이다.',
  },
  {
    id: SkillId.HACK,
    announcement: 'field',
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
    announcement: 'hidden',
    name: '지뢰',
    grade: 2,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '이번 라운드에 지뢰를 깐다. 5개를 맞춰 종을 눌러도 카드가 종 밑에 쌓인다. 쥐새끼가 오면 쥐가 터져 죽고 지뢰는 사라진다. 폭발 전까지 설치 여부는 비밀이다.',
  },
  {
    id: SkillId.HAND_SMASH,
    announcement: 'field',
    name: '손 개 쌔개 내려치기',
    grade: 3,
    timing: SkillTiming.ON_BELL,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '슬롯을 눌러 준비한 뒤, 상대의 종 판정 후 2초 안에 현재 종 키로 내려친다. 맞은 손은 자기 카드를 3장 낼 때마다 한 단계씩 회복해, 9장을 내면 종을 다시 칠 수 있다.',
  },
  {
    id: SkillId.AMATERASU,
    announcement: 'field',
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
    announcement: 'personal',
    name: '무지개 반사',
    grade: 3,
    timing: SkillTiming.AUTOMATIC,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description:
      '나를 노린 스킬(손 개 쌔게 내려치기 포함)을 자동으로 반사해, 쓴 사람이 대신 맞는다. 반사가 없을 때까지 서로 주고받는다.',
  },
  {
    id: SkillId.RAT,
    announcement: 'personal',
    name: '쥐새끼',
    grade: 3,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '쥐를 보내 2초 뒤 종 밑의 카드를 가져온다. 그전에 종이 부서지면 쥐가 잡힌다.',
  },
  {
    id: SkillId.TIME_STOP,
    announcement: 'field',
    name: '시간 정지',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '5초 동안 시간이 멈춘다. 나만 카드를 낼 수 있다.',
  },
  {
    id: SkillId.DORMAMMU,
    announcement: 'field',
    name: '도르마무',
    grade: 4,
    timing: SkillTiming.ON_ROUND_END,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
    description: '종을 치기 전 라운드의 카드 상태로 되돌린다.',
  },
  {
    id: SkillId.RUSSIAN_ROULETTE,
    announcement: 'field',
    name: '러시안 룰렛',
    grade: 4,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.SPECTATOR,
    target: 'none',
    available: true,
    description:
      '종 위에 공포탄 5발·실탄 1발 리볼버를 올린다. 종을 누를 때 실탄이 나오면 테이블 카드가 종 아래로 간다.',
  },
  {
    id: SkillId.RESET,
    announcement: 'field',
    name: '안해',
    grade: 5,
    timing: SkillTiming.ANYTIME,
    user: SkillUser.PLAYER,
    target: 'none',
    available: true,
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

/** 쥐가 노린 카드 수와 서버에서 확정한 결과 */
export interface RatResult {
  at: number;
  outcome: 'stolen' | 'crushed' | 'missed' | 'mined';
  cardCount: number;
}

/** 본인에게만 보내는 스킬 상태(`game:skills`) */
export interface SkillStateEvent {
  /** 마지막 쥐의 결과. 쥐를 보낸 본인에게만 전달한다. */
  ratResult?: RatResult | null;
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
  expectedSkillId?: SkillId;
  targetUserId?: number;
}

/** 종 옮기기로 바뀐 종: 자리(0~3)와 새 키, 끝나는 서버 시각 */
export interface BellMovePublic {
  position: number;
  key: string;
  endsAt: number;
}

/**
 * 시간 정지 중: 쓴 사람, 시작 연출이 끝나 5초 카운트가 시작되는 서버 시각, 끝나는 서버 시각.
 * 연출 시간(`TIME_STOP_INTRO_MS`)은 5초에 들어가지 않는다.
 */
export interface TimeStopPublic {
  userId: number;
  startsAt: number;
  endsAt: number;
}

/** 종 부수기: 종이 돌아오는 서버 시각 */
export interface BellBreakPublic {
  endsAt: number;
}

/** 종 야바위 중: 종마다 단축키가 있고 진짜는 하나뿐이다(어느 것인지는 알리지 않는다) */
export interface BellShellPublic {
  endsAt: number;
  /** 종마다의 단축키. 순서가 종의 번호(0부터)다 */
  keys: string[];
}
