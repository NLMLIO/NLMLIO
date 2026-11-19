import { SkillId, SkillTiming, SkillUser, SKILL_SLOT_COUNT } from '@nlmlio/shared';
import type { SkillChoice, SkillGrade } from '@nlmlio/shared';
import tableFlipIcon from '../../../assets/skills/table-flip.svg';
import rouletteIcon from '../../../assets/skills/roulette.svg';

/**
 * 스킬 화면(FUNC-009)이 그리는 상태. 서버가 확정해 보낸 값을 담는 그릇이고, 후보 뽑기·보유 칸 같은 규칙은 계산하지 않는다.
 * Figma NLML_design 「07 · 스킬」의 21(스킬 선택)·21-1(관전자)·22(스킬 슬롯) 화면을 그린다.
 */

/** 등급 이름과 색. Band·Icon Ring 색 = 등급 색(Figma Skill Card). 6성은 스킬이 없다. */
export const GRADE_STYLE: Record<SkillGrade, { name: string; color: string }> = {
  1: { name: '일반', color: '#9a9aa6' },
  2: { name: '고급', color: '#4fd18b' },
  3: { name: '희귀', color: '#4fa3ff' },
  4: { name: '영웅', color: '#b26bff' },
  5: { name: '전설', color: '#ffd23f' },
};

export const gradeStars = (grade: SkillGrade): string => '★'.repeat(grade) + '☆'.repeat(5 - grade);

export const TIMING_LABEL: Record<SkillTiming, string> = {
  [SkillTiming.ANYTIME]: '언제든지',
  [SkillTiming.ON_OWN_TURN]: '내 차례에',
  [SkillTiming.ON_BELL]: '종 칠 때',
  [SkillTiming.ON_ROUND_END]: '라운드 종료 시',
  [SkillTiming.AUTOMATIC]: '나를 노릴 때',
};

export const USER_LABEL: Record<SkillUser, string> = {
  [SkillUser.PLAYER]: '유저',
  [SkillUser.SPECTATOR]: '관전자',
  [SkillUser.BOTH]: '유저 · 관전자',
};

/** 스킬 아이콘: Noto Emoji 글리프(등급 색으로 칠한다) 또는 Figma에서 내려받은 SVG(마스크로 칠한다) */
export type SkillGlyphSpec = { kind: 'emoji'; char: string } | { kind: 'icon'; url: string };

export const SKILL_GLYPH: Record<SkillId, SkillGlyphSpec> = {
  [SkillId.RESET]: { kind: 'icon', url: tableFlipIcon },
  [SkillId.TIME_STOP]: { kind: 'emoji', char: '⏳' },
  [SkillId.HAND_SMASH]: { kind: 'emoji', char: '✋' },
  [SkillId.BELL_MOVE]: { kind: 'emoji', char: '🔀' },
  [SkillId.AMATERASU]: { kind: 'emoji', char: '🔥' },
  [SkillId.NUMBER_SHIFT]: { kind: 'emoji', char: '🤫' },
  [SkillId.SPIT]: { kind: 'emoji', char: '💦' },
  [SkillId.BELL_BREAK]: { kind: 'emoji', char: '👊' },
  [SkillId.RAINBOW_REFLECT]: { kind: 'emoji', char: '🌈' },
  [SkillId.SPARKLE_CARD]: { kind: 'emoji', char: '✨' },
  [SkillId.BELL_SHELL_GAME]: { kind: 'emoji', char: '🎩' },
  [SkillId.HACK]: { kind: 'emoji', char: '💻' },
  [SkillId.DORMAMMU]: { kind: 'emoji', char: '🌀' },
  [SkillId.MINE]: { kind: 'emoji', char: '💣' },
  [SkillId.SIX_FRUIT_CARD]: { kind: 'emoji', char: '🍓' },
  [SkillId.RUSSIAN_ROULETTE]: { kind: 'icon', url: rouletteIcon },
  [SkillId.RAT]: { kind: 'emoji', char: '🐭' },
};

/** 스킬 슬롯 단축키. 슬롯 번호 0·1·2 */
export const SLOT_KEYS = ['Q', 'W', 'E'] as const;
export const SLOT_COUNT = SKILL_SLOT_COUNT;

export interface SkillSlotView {
  /** 비어 있으면 null */
  skillId: SkillId | null;
  /** false면 지금은 쓸 수 없는 시점이라 흐리게 보인다(opacity 45%) */
  usable: boolean;
}

export interface SkillPickView {
  /** 후보를 받는 역할. 관전자는 관전자용 문구를 보여 준다 */
  role: 'player' | 'spectator';
  /** 게임 전체 종 성공 누적 횟수(5·10·15…) */
  successCount: number;
  /** 이번이 몇 번째 선택인지 */
  pickNo: number;
  /** 서버가 정한 후보 3칸 */
  candidates: SkillId[];
  /** 내가 고른 후보 칸. 아직 안 골랐으면 null */
  chosenCandidate: number | null;
  /** 고른 스킬이 들어간 보유 칸 */
  placedSlot: number | null;
  /** 칸이 가득 차서 받지 않기로 했다 */
  declined: boolean;
  /** 남은 선택 시간(초) */
  secondsLeft: number;
  /** 선택을 마친 사람 수와 전체(나를 뺀 같은 역할 기준) */
  progress: { done: number; total: number };
}

export interface SkillsView {
  slots: SkillSlotView[];
  pick?: SkillPickView;
}

/** 보유 칸에서 가장 앞의 빈 칸. 가득 찼으면 -1 */
export const firstEmptySlot = (slots: SkillSlotView[]): number =>
  slots.findIndex((slot) => slot.skillId === null);

export const isFull = (slots: SkillSlotView[]): boolean => firstEmptySlot(slots) < 0;

export type SkillPickHandler = (choice: SkillChoice) => void;

/** 0:07 모양으로 남은 시간을 쓴다 */
export const clock = (seconds: number): string =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
