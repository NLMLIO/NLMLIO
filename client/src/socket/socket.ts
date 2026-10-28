import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { RoomClientEvent, RoomServerEvent } from '@nlmlio/shared';
import type { RoomAck, RoomClientToServerEvents, RoomServerToClientEvents } from '@nlmlio/shared';
import { codeMessage, getAccessToken, refreshSession } from '../api/http';
import { roomActions } from '../stores/room-store';

type GameSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

let socket: GameSocket | null = null;

/** 로그인한 동안 소켓 하나를 유지한다. Access 토큰이 만료되면 재발급 후 다시 붙는다. */
export function connectSocket(): void {
  if (socket) return;
  const current: GameSocket = io({
    autoConnect: false,
    auth: (send) => send({ token: getAccessToken() }),
  });
  socket = current;
  current.on('connect', () => roomActions.connection(true));
  current.on('disconnect', () => roomActions.connection(false));
  current.on('connect_error', (error) => {
    if (!['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(error.message)) return;
    refreshSession()
      .then(() => {
        if (socket === current) current.connect();
      })
      .catch(() => window.dispatchEvent(new Event('nlmlio:session-expired')));
  });
  current.on(RoomServerEvent.STATE, roomActions.state);
  current.on(RoomServerEvent.NOTICE, roomActions.notice);
  current.on(RoomServerEvent.KICKED, roomActions.kicked);
  current.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  roomActions.connection(false);
  roomActions.state(null);
}

type RoomIntent = (typeof RoomClientEvent)[keyof typeof RoomClientEvent];

/** 서버에 «의도»를 보내고 ack를 기다린다. 실패하면 안내 문구를, 성공하면 null을 돌려준다. */
export async function sendIntent<E extends RoomIntent>(
  event: E,
  payload: Parameters<RoomClientToServerEvents[E]>[0],
): Promise<string | null> {
  if (!socket?.connected) return '서버와 연결이 끊겼어요. 잠시 후 다시 시도해주세요.';
  try {
    const result: RoomAck = await (
      socket.timeout(5000) as unknown as {
        emitWithAck: (event: string, payload: unknown) => Promise<RoomAck>;
      }
    ).emitWithAck(event, payload);
    return result.ok ? null : codeMessage(result.code);
  } catch {
    return '서버 응답이 없어요. 잠시 후 다시 시도해주세요.';
  }
}
