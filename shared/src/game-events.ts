import type { Fruit } from './domain';
import type { ErrorCode } from './errors';

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
  count: 1 | 2 | 3 | 4 | 5;
}
export const GameClientEvent = {
  SYNC: 'game:sync',
  PLAY: 'card:play',
  BELL: 'bell:ring',
  RETURN: 'game:return',
} as const;
export const GameServerEvent = { STATE: 'game:state', ACTION: 'game:action' } as const;
export interface CardPlayRequest {
  gameId: string;
  turnId: number;
}
export interface BellRingRequest {
  gameId: string;
  turnSeq: number;
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
  lastPlayAt: number | null;
  startedAt: number;
  endedAt: number | null;
  players: GamePlayerView[];
  pileCount: number;
  fruitTotals: Record<Fruit, number>;
  results: GameResultEntry[];
  settled: boolean;
}
/** `game:state` 페이로드. 보낼 때의 서버 시각을 붙여 클라이언트가 시계 차이를 잰다. */
export type GameStateEvent = GameSnapshot & { serverTime: number };
export type GameAction =
  | { kind: 'card'; userId: number; card: GameCard; automatic: boolean }
  | {
      kind: 'bell';
      userId: number;
      success: boolean;
      movedCards: number;
      totals: Record<Fruit, number>;
    }
  | { kind: 'departed'; userId: number }
  | { kind: 'connection'; userId: number; connected: boolean };
export type GameActionEvent = GameAction & { gameId: string; revision: number };
export type GameAck = { ok: true; ignored?: boolean } | { ok: false; code: ErrorCode };
export interface GameClientToServerEvents {
  'game:sync': (payload: Record<string, never>, ack: (result: GameAck) => void) => void;
  'card:play': (payload: CardPlayRequest, ack: (result: GameAck) => void) => void;
  'bell:ring': (payload: BellRingRequest, ack: (result: GameAck) => void) => void;
  'game:return': (payload: Record<string, never>, ack: (result: GameAck) => void) => void;
}
export interface GameServerToClientEvents {
  'game:state': (state: GameStateEvent | null) => void;
  'game:action': (action: GameActionEvent) => void;
}
