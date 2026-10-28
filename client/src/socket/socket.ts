import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ChatEvent, RoomClientEvent, RoomServerEvent } from '@nlmlio/shared';
import type {
  ChatAck,
  ChatEmojiCode,
  ChatMessageEvent,
  EmojiMessageEvent,
  RoomAck,
  RoomClientToServerEvents,
  RoomResponse,
  RoomServerToClientEvents,
} from '@nlmlio/shared';
import { codeMessage, getAccessToken, refreshSession } from '../api/http';
import { roomActions } from '../stores/room-store';

type GameSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

let socket: GameSocket | null = null;
/** 채팅 채널(chat:{code})에 들어가 있는 방. 재연결하면 다시 들어가야 한다. */
let chatRoom: string | null = null;

type RawSocket = {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, listener: (payload: never) => void) => void;
  timeout: (ms: number) => { emitWithAck: (event: string, payload?: unknown) => Promise<RoomAck> };
};
const raw = (target: GameSocket) => target as unknown as RawSocket;

/** 방이 바뀔 때마다 채팅 채널을 맞춘다(FUNC-004-01). */
function syncChat(room: RoomResponse | null): void {
  if (!socket?.connected || chatRoom === (room?.code ?? null)) return;
  chatRoom = room?.code ?? null;
  raw(socket).emit(room ? ChatEvent.JOIN : ChatEvent.LEAVE, room ? { code: room.code } : {});
}

/** 로그인한 동안 소켓 하나를 유지한다. Access 토큰이 만료되면 재발급 후 다시 붙는다. */
export function connectSocket(): void {
  if (socket) return;
  const current: GameSocket = io({
    autoConnect: false,
    auth: (send) => send({ token: getAccessToken() }),
  });
  socket = current;
  current.on('connect', () => roomActions.connection(true));
  current.on('disconnect', () => {
    chatRoom = null;
    roomActions.connection(false);
  });
  current.on('connect_error', (error) => {
    if (!['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(error.message)) return;
    refreshSession()
      .then(() => {
        if (socket === current) current.connect();
      })
      .catch(() => window.dispatchEvent(new Event('nlmlio:session-expired')));
  });
  current.on(RoomServerEvent.STATE, (room) => {
    roomActions.state(room);
    syncChat(room);
  });
  current.on(RoomServerEvent.NOTICE, roomActions.notice);
  current.on(RoomServerEvent.KICKED, roomActions.kicked);
  raw(current).on(ChatEvent.MESSAGE, (message: ChatMessageEvent) => roomActions.chat(message));
  raw(current).on(ChatEvent.EMOJI, ({ userId, emoji }: EmojiMessageEvent) =>
    roomActions.emoji(userId, emoji),
  );
  current.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  chatRoom = null;
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
    return ackMessage(await raw(socket).timeout(5000).emitWithAck(event, payload));
  } catch {
    return '서버 응답이 없어요. 잠시 후 다시 시도해주세요.';
  }
}

const ackMessage = (result: RoomAck | ChatAck) => (result.ok ? null : codeMessage(result.code));

/** 채팅·이모티콘 전송(FUNC-004-01·02). 실패하면 안내 문구를 돌려준다. */
export async function sendChat(
  kind: 'message' | 'emoji',
  value: string | ChatEmojiCode,
): Promise<string | null> {
  if (!socket?.connected) return '서버와 연결이 끊겨 보내지 못했어요.';
  try {
    const result = await raw(socket)
      .timeout(5000)
      .emitWithAck(
        kind === 'message' ? ChatEvent.SEND : ChatEvent.EMOJI_SEND,
        kind === 'message' ? { message: value } : { emoji: value },
      );
    return ackMessage(result);
  } catch {
    return '서버 응답이 없어요. 잠시 후 다시 시도해주세요.';
  }
}
