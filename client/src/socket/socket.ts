import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  ChatEvent,
  ErrorCode,
  GameClientEvent,
  GameServerEvent,
  GameStatus,
  RoomClientEvent,
  RoomServerEvent,
} from '@nlmlio/shared';
import type {
  ChatAck,
  GameAck,
  GameActionEvent,
  GameClientToServerEvents,
  GameStateEvent,
  ChatEmojiCode,
  ChatMessageEvent,
  EmojiMessageEvent,
  RoomAck,
  RoomClientToServerEvents,
  RoomResponse,
  RoomServerToClientEvents,
} from '@nlmlio/shared';
import { codeMessage, getAccessToken, refreshSession } from '../api/http';
import { playSound } from '../audio/sounds';
import { gameActions, useGameStore } from '../stores/game-store';
import { roomActions } from '../stores/room-store';

type GameSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

let socket: GameSocket | null = null;
/** 채팅 채널(chat:{code})에 들어가 있는 방. 재연결하면 다시 들어가야 한다. */
let chatRoom: string | null = null;

type RawSocket = {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, listener: (payload: never) => void) => void;
  timeout: (ms: number) => {
    emitWithAck: (event: string, payload?: unknown) => Promise<RoomAck | ChatAck | GameAck>;
  };
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
    // 방에 없으면 볼 게임도 없다(직접 나가기·추방·방 삭제).
    if (!room) gameActions.state(null);
  });
  raw(current).on(GameServerEvent.STATE, receiveGameState);
  raw(current).on(GameServerEvent.ACTION, receiveGameAction);
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
  gameActions.state(null);
}

function receiveGameState(next: GameStateEvent | null): void {
  const before = useGameStore.getState().snapshot;
  gameActions.state(next);
  const after = useGameStore.getState().snapshot;
  if (
    after &&
    after !== before &&
    after.status === GameStatus.ENDED &&
    before?.gameId === after.gameId &&
    before.status === GameStatus.PLAYING
  )
    playSound('end');
}

function receiveGameAction(event: GameActionEvent): void {
  const nickname =
    useGameStore.getState().snapshot?.players.find((player) => player.userId === event.userId)
      ?.nickname ?? '';
  if (!gameActions.action(event)) return;
  if (event.kind === 'card') playSound('card');
  if (event.kind === 'bell') playSound(event.success ? 'success' : 'misfire');
  if (event.kind !== 'card') roomActions.game(event, nickname);
}

type GameIntent = Exclude<
  (typeof GameClientEvent)[keyof typeof GameClientEvent],
  typeof GameClientEvent.SYNC
>;

/**
 * 게임 «의도»(카드 내기·종·결과 확인)를 보낸다. 결과는 ack가 아니라 서버가 방 전체에 보낸 상태로 그린다.
 * 실패하면 안내 문구를, 성공하거나 조용히 무시된 요청이면 null을 돌려준다.
 */
export async function sendGameIntent<E extends GameIntent>(
  event: E,
  payload: Parameters<GameClientToServerEvents[E]>[0],
): Promise<string | null> {
  return emitIntent(event, payload, {
    disconnected: '서버와 연결이 끊겼어요. 다시 연결되면 화면이 맞춰져요.',
    timeout: '서버 응답이 없어요. 현재 상태를 다시 불러올게요.',
    // ack를 못 받았으면 실제 상태를 다시 받아 맞춘다.
    onTimeout: (target) => raw(target).emit(GameClientEvent.SYNC, {}),
  });
}

type RoomIntent = (typeof RoomClientEvent)[keyof typeof RoomClientEvent];

/** 서버에 «의도»를 보내고 ack를 기다린다. 실패하면 안내 문구를, 성공하면 null을 돌려준다. */
export async function sendIntent<E extends RoomIntent>(
  event: E,
  payload: Parameters<RoomClientToServerEvents[E]>[0],
): Promise<string | null> {
  return emitIntent(event, payload, {
    disconnected: '서버와 연결이 끊겼어요. 잠시 후 다시 시도해주세요.',
    timeout: '서버 응답이 없어요. 잠시 후 다시 시도해주세요.',
  });
}

const ackMessage = (result: RoomAck | ChatAck | GameAck) =>
  result.ok ? null : codeMessage(result.code);

const AUTH_ERRORS: string[] = [ErrorCode.TOKEN_EXPIRED, ErrorCode.TOKEN_INVALID];
/** 재연결을 기다리는 최대 시간 */
const RECONNECT_WAIT_MS = 5000;
let reauthenticating: Promise<boolean> | null = null;

/**
 * 연결을 유지한 채 Access 토큰이 만료돼 이벤트가 거부됐다. 서버는 handshake 토큰으로 매 요청을 검증하므로
 * 재발급한 뒤 새 토큰으로 다시 붙는다. 연결 직후 서버가 보내는 room:state·game:state로 화면이 맞춰진다.
 * 동시에 실패한 요청들은 한 번의 재발급·재연결을 함께 기다린다.
 */
function reauthenticate(target: GameSocket): Promise<boolean> {
  reauthenticating ??= refreshSession()
    .then(
      () =>
        new Promise<boolean>((resolve) => {
          if (socket !== target) return resolve(false);
          const connected = () => {
            clearTimeout(timer);
            resolve(true);
          };
          const timer = setTimeout(() => {
            target.off('connect', connected);
            resolve(false);
          }, RECONNECT_WAIT_MS);
          target.once('connect', connected);
          target.disconnect().connect();
        }),
    )
    .catch(() => {
      window.dispatchEvent(new Event('nlmlio:session-expired'));
      return false;
    })
    .finally(() => {
      reauthenticating = null;
    });
  return reauthenticating;
}

/** ack를 기다리는 의도 전송. 토큰 만료로 거부되면 재인증 뒤 한 번만 다시 보낸다. */
async function emitIntent(
  event: string,
  payload: unknown,
  messages: { disconnected: string; timeout: string; onTimeout?: (target: GameSocket) => void },
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const current = socket;
    if (!current?.connected) return messages.disconnected;
    let result: RoomAck | ChatAck | GameAck;
    try {
      result = await raw(current).timeout(5000).emitWithAck(event, payload);
    } catch {
      messages.onTimeout?.(current);
      return messages.timeout;
    }
    if (!result.ok && attempt === 0 && AUTH_ERRORS.includes(result.code))
      if (await reauthenticate(current)) continue;
    return ackMessage(result);
  }
}

/** 채팅·이모티콘 전송(FUNC-004-01·02). 실패하면 안내 문구를 돌려준다. */
export async function sendChat(
  kind: 'message' | 'emoji',
  value: string | ChatEmojiCode,
): Promise<string | null> {
  return emitIntent(
    kind === 'message' ? ChatEvent.SEND : ChatEvent.EMOJI_SEND,
    kind === 'message' ? { message: value } : { emoji: value },
    {
      disconnected: '서버와 연결이 끊겨 보내지 못했어요.',
      timeout: '서버 응답이 없어요. 잠시 후 다시 시도해주세요.',
    },
  );
}
