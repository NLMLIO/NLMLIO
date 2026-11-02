// 대기실 Socket.io 이벤트 이름과 페이로드. C→S는 클라이언트의 «의도», S→C는 서버가 확정한 결과다.
// 채팅·이모티콘 이벤트는 따로 정의한다(FUNC-004).

import type { RoomRole } from './domain';
import type { RoomResponse } from './dto';
import type { ErrorCode } from './errors';

export const RoomClientEvent = {
  MOVE: 'room:move',
  KICK: 'room:kick',
  DELEGATE: 'room:delegate',
  START: 'room:start',
} as const;

export const RoomServerEvent = {
  STATE: 'room:state',
  NOTICE: 'room:notice',
  KICKED: 'room:kicked',
} as const;

/** 자기 자리를 옮기거나(본인), 방장이 다른 회원의 자리를 옮긴다 */
export interface RoomMovePayload {
  userId: number;
  role: RoomRole;
}

export interface RoomTargetPayload {
  userId: number;
}

/** C→S 이벤트의 ack 응답 */
export type RoomAck = { ok: true } | { ok: false; code: ErrorCode };

/** 채팅창에 남는 방 안내(입장·퇴장·자리 이동·추방·방장 변경·게임 시작) */
export type RoomNotice =
  | { type: 'joined' | 'left' | 'kicked'; nickname: string }
  | { type: 'moved'; nickname: string; role: RoomRole }
  | { type: 'host'; nickname: string }
  | { type: 'started' };

export interface RoomServerToClientEvents {
  'room:state': (room: RoomResponse | null) => void;
  'room:notice': (notice: RoomNotice) => void;
  'room:kicked': () => void;
}

export interface RoomClientToServerEvents {
  'room:move': (payload: RoomMovePayload, ack: (result: RoomAck) => void) => void;
  'room:kick': (payload: RoomTargetPayload, ack: (result: RoomAck) => void) => void;
  'room:delegate': (payload: RoomTargetPayload, ack: (result: RoomAck) => void) => void;
  'room:start': (payload: Record<string, never>, ack: (result: RoomAck) => void) => void;
}
