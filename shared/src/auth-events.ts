import type { ErrorCode } from './errors';

export const SocketAuthEvent = { REFRESH: 'auth:refresh', REQUIRED: 'auth:required' } as const;
export interface SocketAuthRequest {
  token: string;
}
export type SocketAuthAck = { ok: true } | { ok: false; code: ErrorCode };

export interface SocketAuthClientToServerEvents {
  'auth:refresh': (payload: SocketAuthRequest, ack: (result: SocketAuthAck) => void) => void;
}
export interface SocketAuthServerToClientEvents {
  'auth:required': (error: { code: ErrorCode }) => void;
}
