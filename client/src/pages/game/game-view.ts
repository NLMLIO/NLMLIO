import type { Fruit } from '@nlmlio/shared';

/**
 * 게임 화면이 그리는 상태. 서버가 확정해 보낸 값을 그대로 담는 그릇이고, 여기서 규칙을 계산하지 않는다.
 * 게임 엔진·소켓 이벤트가 생기면 shared의 스냅샷 타입에서 이 모양으로 옮겨 담는다.
 */

/** 아바타·채팅 닉네임 색 */
export type PlayerColor = 'strawberry' | 'banana' | 'lime' | 'plum' | 'white';

export interface CardFace {
  fruit: Fruit;
  count: 1 | 2 | 3 | 4 | 5;
}

/**
 * 종 판정 직후 플레이어 슬롯 아래에 붙는 결과 배지.
 * win: 종 성공(WIN +10) / misfire: 오발한 사람이 나눠 준 장수(오발 −3) / receive: 오발 벌칙으로 받은 카드(+1)
 */
export interface SeatOutcome {
  tone: 'win' | 'misfire' | 'receive';
  label: string;
}

export interface PlayerView {
  id: string;
  nickname: string;
  color: PlayerColor;
  deckCount: number;
  /** 자기 앞 테이블의 맨 위 카드. 아직 안 냈거나 관전자면 null */
  topCard: CardFace | null;
  /** active: 플레이 중 / out: 탈락·이탈(관전자) / offline: 연결 끊김 유예 중 */
  state: 'active' | 'out' | 'offline';
  /** offline일 때 화면에 보여 줄 남은 유예 시간(초) */
  offlineSeconds?: number;
  isTurn: boolean;
  /** 방금 보낸 감정표현 이모티콘 */
  emote?: string;
  outcome?: SeatOutcome;
}

/**
 * 하단 내 상태 바.
 * turn: 내 차례 / first: 시작 카운트다운 중이고 첫 차례가 나 / waiting: 다른 사람 차례 /
 * judging: 종 판정 표시 중 / spectating: 탈락·이탈 후 관전
 */
export type MyPhase = 'turn' | 'first' | 'waiting' | 'judging' | 'spectating';

export type BellState =
  | { kind: 'idle' }
  | { kind: 'countdown'; value: number }
  | { kind: 'success' }
  | { kind: 'misfire' };

export interface Verdict {
  tone: 'success' | 'misfire';
  ringer: { nickname: string; color: PlayerColor };
  /** 판정 근거. 예: "라임 2 + 3 = 5", "딸기 4 · 바나나 3 · 자두 1" */
  formula: string;
  detail: string;
}

export interface Banner {
  tone: 'accent' | 'danger';
  messages: string[];
}

export type LogEntry =
  | { kind: 'chat'; id: string; nickname: string; color: PlayerColor; text: string }
  | { kind: 'event'; id: string; tone: 'success' | 'danger'; nickname: string; text: string }
  | { kind: 'system'; id: string; text: string };

export interface GameView {
  roomName: string;
  /** 자리 순서(시계 방향). 첫 번째가 나이고 화면 아래에 앉는다 */
  players: PlayerView[];
  myPhase: MyPhase;
  /** 지금 차례인 플레이어 닉네임(waiting일 때 표시) */
  turnNickname?: string;
  /** 종 아래 보관 스택 카드 수 */
  pileCount: number;
  bell: BellState;
  banner?: Banner;
  verdict?: Verdict;
  log: LogEntry[];
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  color: PlayerColor;
  isMe: boolean;
}

export const FRUIT_NAMES: Record<Fruit, string> = {
  STRAWBERRY: '딸기',
  BANANA: '바나나',
  LIME: '라임',
  PLUM: '자두',
};

/** 디자인 기준 게임 화면 크기(px). 이 좌표계로 그린 뒤 창 크기에 맞춰 통째로 줄이거나 키운다 */
export const SCREEN_WIDTH = 1440;
export const SCREEN_HEIGHT = 900;

/** 보드(채팅 패널 왼쪽 1100×900) 안의 테이블 중심과 자리 배치 반지름 */
const TABLE_CENTER = { x: 550, y: 440 };
const SEAT_RADIUS = { x: 420, y: 330 };
const CARD_RADIUS = { x: 199, y: 189 };

export interface SeatPlacement {
  /** 플레이어 슬롯(아바타·닉네임·카드 수) 중심 */
  seat: { x: number; y: number };
  /** 테이블 위쪽 자리는 배지가 붙어도 테이블 카드를 가리지 않게 슬롯을 위로 늘린다 */
  seatGrowsUp: boolean;
  /** 테이블 카드 중심 */
  card: { x: number; y: number };
  /** 테이블 카드가 앉은 사람 쪽을 바라보도록 돌리는 각도 */
  rotation: number;
  /** 카드를 돌려도 그림자가 화면 기준 오른쪽 아래에 떨어지도록 카드 안쪽 좌표로 바꾼 방향 */
  shadow: { x: number; y: number };
}

/** 내 자리를 맨 아래(90°)로 두고 인원수만큼 시계 방향으로 같은 간격을 둔다 */
export function seatPlacements(playerCount: number): SeatPlacement[] {
  return Array.from({ length: playerCount }, (_, index) => {
    const degrees = 90 + (index * 360) / playerCount;
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotation = degrees - 90;
    const turn = (rotation * Math.PI) / 180;
    return {
      seat: { x: TABLE_CENTER.x + SEAT_RADIUS.x * cos, y: TABLE_CENTER.y + SEAT_RADIUS.y * sin },
      seatGrowsUp: sin < -0.7,
      card: { x: TABLE_CENTER.x + CARD_RADIUS.x * cos, y: TABLE_CENTER.y + CARD_RADIUS.y * sin },
      rotation,
      shadow: { x: Math.cos(turn) + Math.sin(turn), y: Math.cos(turn) - Math.sin(turn) },
    };
  });
}
