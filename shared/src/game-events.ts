import type { Fruit } from './domain';
import type { ErrorCode } from './errors';
import type {
  BellBreakPublic,
  BellMovePublic,
  BellShellPublic,
  SkillId,
  SkillPickPublic,
  SkillPickRequest,
  SkillStateEvent,
  SkillUseRequest,
  TimeStopPublic,
} from './skills';

/** 차례마다 카드를 낼 수 있는 시간(FUNC-005-15). 넘기면 서버가 대신 낸다. */
export const TURN_TIME_MS = 10_000;
/** 종 판정 결과를 함께 확인하는 동안 카드 내기를 멈춘다. */
export const ROUND_RESULT_MS = 1800;
/** 게임 중 연결이 끊긴 뒤 이탈 처리까지 기다리는 시간(FUNC-003-07) */
export const GAME_RECONNECT_GRACE_MS = 5_000;

export const GameStatus = { PLAYING: 'PLAYING', ENDED: 'ENDED' } as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];
export const GamePlayerStatus = {
  ACTIVE: 'ACTIVE',
  ELIMINATED: 'ELIMINATED',
  DEPARTED: 'DEPARTED',
} as const;
export type GamePlayerStatus = (typeof GamePlayerStatus)[keyof typeof GamePlayerStatus];
export interface GameCard {
  fruit: Fruit;
  /** 6은 과일 6개 카드(스킬)뿐이다 */
  count: 1 | 2 | 3 | 4 | 5 | 6;
  /** 과일 6개 카드: 판정이 나면 성공·오발과 상관없이 사라진다 */
  special?: true;
  /** 숫자 바꾸기로 과일 개수가 1 늘었다(`count`는 늘어난 값). 카드가 테이블을 떠나면 원래대로 돌아온다 */
  boosted?: true;
  /** 반짝반짝한 카드(꾸미기, 판정에 영향 없음). 판정으로 옮겨지면 사라진다 */
  gilded?: true;
}
export const GameClientEvent = {
  SYNC: 'game:sync',
  PLAY: 'card:play',
  BELL: 'bell:ring',
  RETURN: 'game:return',
  SKILL_PICK: 'skill:pick',
  SKILL_USE: 'skill:use',
} as const;
export const GameServerEvent = {
  STATE: 'game:state',
  ACTION: 'game:action',
  SKILLS: 'game:skills',
} as const;
export interface CardPlayRequest {
  gameId: string;
  turnId: number;
}
export interface BellRingRequest {
  gameId: string;
  turnSeq: number;
  /** 종 야바위 중 누른 종의 번호(`shell.keys` 순서). 야바위가 아닐 때는 보내지 않는다 */
  bell?: number;
}
export interface GamePlayerView {
  userId: number;
  nickname: string;
  status: GamePlayerStatus;
  connected: boolean;
  handCount: number;
  tableCount: number;
  topCard: GameCard | null;
  automaticTurns: number;
}
export interface GameResultEntry {
  userId: number;
  nickname: string;
  rank: number;
  departed: boolean;
  bellSuccess: number;
  bellFail: number;
  reactionSumMs: number;
}
export interface BellHandsView {
  turnSeq: number;
  /** 이 서버 시각까지(판정 결과를 보여 주는 동안) 늦게 누른 손도 접수 순서대로 올라간다 */
  displayUntil: number;
  /** 첫 판정 직전 생존 참가자. 관전자와 이미 탈락한 사람은 제외 */
  eligibleUserIds: number[];
  /** 서버 접수 순서. 첫 손이 판정자이며 뒤의 손은 시각 효과만 갖는다 */
  userIds: number[];
}
export interface GameSnapshot {
  gameId: string;
  roomCode: string;
  roomName: string;
  status: GameStatus;
  revision: number;
  round: number;
  turnUserId: number | null;
  /** 카드 내기/종 판정으로 새 차례가 될 때마다 변경. 카드 중복 요청 방지용. */
  turnId: number;
  /** 카드를 낼 때마다 변경. 같은 공개 테이블에 대한 종 중복 요청 방지용. */
  turnSeq: number;
  turnDeadline: number | null;
  /** 이 서버 시각까지 종 판정 결과 표시 중. null이면 바로 카드 내기가 가능하다. */
  roundResumeAt: number | null;
  bellHands?: BellHandsView | null;
  lastPlayAt: number | null;
  startedAt: number;
  endedAt: number | null;
  players: GamePlayerView[];
  pileCount: number;
  fruitTotals: Record<Fruit, number>;
  results: GameResultEntry[];
  settled: boolean;
  /** 게임 전체 종 성공 누적 횟수 */
  skillSuccesses: number;
  /** 스킬 선택 중이면 진행 현황. 선택 중에는 카드 내기·종·턴 타이머가 멈춘다 */
  skillPick: SkillPickPublic | null;
  /** 종 옮기기가 진행 중이면 새 자리·새 키(끝났어도 다음 변경까지 남을 수 있어 `endsAt`으로 판단한다) */
  bellMove: BellMovePublic | null;
  /** 시간 정지 중이면 쓴 사람과 끝나는 시각. 쓴 사람만 카드를 낼 수 있고 나머지는 카드·종이 모두 불가다 */
  timeStop: TimeStopPublic | null;
  /** 종 부수기: 종이 돌아올 때까지 아무도 종을 칠 수 없다 */
  bellBreak: BellBreakPublic | null;
  /** 종 아래의 쥐는 누구나 볼 수 있다. 소유자 정보는 숨긴다. */
  rat?: { endsAt: number; cardCount: number } | null;
  /** 아마테라스에 걸린 사람들. 다음 종 판정(또는 탈락)까지 카드 내기·종 치기가 불가다 */
  burning: number[];
  /** 종 야바위 중이면 종마다의 단축키와 끝나는 시각 */
  shell: BellShellPublic | null;
  /** 도르마무로 되돌릴 수 있는 마감 시각(방금 종 판정이 났고 결과를 보여 주는 동안). 아니면 null */
  rewindUntil: number | null;
  /** 방금 종 판정이 났다: 이 시각까지 다른 플레이어가 손 개 쌔게 내려치기로 종을 친 사람을 칠 수 있다 */
  smashWindow: { userId: number; endsAt: number } | null;
  /** 손이 부서진 사람들. 단계(3→1)가 내려가 사라질 때까지 종을 칠 수 없다 */
  smashed: SmashedHand[];
  /** 러시안 룰렛: 종 위에 올려 둔 리볼버. 없으면 null */
  revolver: RevolverPublic | null;
}
/** 손 개 쌔게 내려치기를 맞은 손. 자기 카드를 3장 낼 때마다 단계가 하나 내려가고 0이 되면 풀린다 */
export interface SmashedHand {
  userId: number;
  /** 3(방금 맞음) → 2 → 1(거의 회복). 1단계에서 3장을 더 내면 풀린다 */
  stage: 1 | 2 | 3;
}
/** 종 위 리볼버에 남은 탄 */
export interface RevolverPublic {
  blanks: number;
  live: number;
}
/** `game:state` 페이로드. 보낼 때의 서버 시각을 붙여 클라이언트가 시계 차이를 잰다. */
export type GameStateEvent = GameSnapshot & { serverTime: number };
export type GameAction =
  | { kind: 'card'; userId: number; card: GameCard; automatic: boolean }
  | {
      kind: 'bell';
      userId: number;
      success: boolean;
      /** 성공 시 가져간 카드 수, 오발 시 테이블 전체에서 보관 스택으로 옮긴 카드 수 */
      movedCards: number;
      /** 오발자가 다른 생존 플레이어에게 1장씩 나눠 준 총 벌칙 카드 수 */
      penaltyCards?: number;
      /** 이 오발에서 실제로 벌칙 카드를 한 장씩 받은 플레이어 */
      penaltyRecipients?: number[];
      totals: Record<Fruit, number>;
      /** 지뢰가 터졌다: 5개를 맞췄지만 카드가 모두 종 밑으로 갔다. 성공도 오발도 아니다 */
      mined?: true;
      /** 종 위 리볼버가 발사됐다. 실탄이면 테이블 카드가 모두 종 밑으로 가고 성공도 오발도 아니다 */
      revolver?: { fired: 'blank' | 'live'; blanks: number };
      /** 종 야바위 중 가짜 종을 눌러 오발로 처리됐다 */
      fake?: true;
    }
  | { kind: 'departed'; userId: number }
  /** 스킬 사용 알림. 개인 스킬이면 시전자·피격자·반사자에게만 전달한다. */
  | {
      kind: 'skill';
      userId: number;
      skillId: SkillId;
      /** 효과를 받은 사람. 무지개 반사가 일어났다면 마지막으로 반사를 맞은 사람이다 */
      targetUserId: number | null;
      /** 무지개 반사로 막아 낸 사람들. 반사가 없을 때까지 주고받으므로 막은 순서대로 담긴다 */
      reflectedBy?: number[];
      /** 종 부수기가 살아 있는 쥐를 잡았을 때만 설정한다. */
      ratCrushed?: true;
      /** 쥐새끼가 깔려 있던 지뢰를 밟아 죽었다(지뢰도 사라진다). */
      ratMined?: true;
    }
  | { kind: 'connection'; userId: number; connected: boolean };
export type GameActionEvent = GameAction & { gameId: string; revision: number };
export type GameAck =
  | {
      ok: true;
      ignored?: boolean;
      handAccepted?: boolean;
      /** 이미 지난 테이블이라 손도 올릴 수 없는 늦은 종 요청(이때만 안내한다) */
      late?: boolean;
    }
  | { ok: false; code: ErrorCode };
export interface GameClientToServerEvents {
  'game:sync': (payload: Record<string, never>, ack: (result: GameAck) => void) => void;
  'card:play': (payload: CardPlayRequest, ack: (result: GameAck) => void) => void;
  'bell:ring': (payload: BellRingRequest, ack: (result: GameAck) => void) => void;
  'game:return': (payload: Record<string, never>, ack: (result: GameAck) => void) => void;
  'skill:pick': (payload: SkillPickRequest, ack: (result: GameAck) => void) => void;
  'skill:use': (payload: SkillUseRequest, ack: (result: GameAck) => void) => void;
}
export interface GameServerToClientEvents {
  'game:state': (state: GameStateEvent | null) => void;
  'game:action': (action: GameActionEvent) => void;
  /** 본인에게만. 보유 스킬과 선택 후보 */
  'game:skills': (state: SkillStateEvent | null) => void;
}
