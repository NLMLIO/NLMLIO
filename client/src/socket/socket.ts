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
  RoomStatus,
  SocketAuthEvent,
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
  SocketAuthClientToServerEvents,
  SocketAuthServerToClientEvents,
  RoomClientToServerEvents,
  RoomResponse,
  RoomServerToClientEvents,
} from '@nlmlio/shared';
import {
  ApiError,
  accessExpiresAt,
  codeMessage,
  getAccessToken,
  refreshSession,
} from '../api/http';
import { playSound } from '../audio/sounds';
import { gameActions, useGameStore } from '../stores/game-store';
import { roomActions, useRoomStore } from '../stores/room-store';

type GameSocket = Socket<
  RoomServerToClientEvents & SocketAuthServerToClientEvents,
  RoomClientToServerEvents & SocketAuthClientToServerEvents
>;

let socket: GameSocket | null = null;
/** 채팅 채널(chat:{code})에 들어가 있는 방. 재연결하면 다시 들어가야 한다. */
let chatRoom: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let tokenListener: (() => void) | undefined;
let focusListener: (() => void) | undefined;

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
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    auth: (send) => send({ token: getAccessToken() }),
  });
  socket = current;
  current.on('connect', () => {
    roomActions.connection(true);
    scheduleRefresh(current);
  });
  tokenListener = () => {
    scheduleRefresh(current);
    if (current.connected) void updateSocketToken(current);
  };
  focusListener = () => {
    if (document.visibilityState === 'visible' && accessExpiresAt() - Date.now() <= 30_000)
      void reauthenticate(current);
  };
  window.addEventListener('nlmlio:access-token', tokenListener);
  window.addEventListener('focus', focusListener);
  document.addEventListener('visibilitychange', focusListener);
  raw(current).on(SocketAuthEvent.REQUIRED, () => void reauthenticate(current));
  current.on('disconnect', () => {
    chatRoom = null;
    roomActions.connection(false);
  });
  current.on('connect_error', (error) => {
    if (!['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(error.message)) return;
    void reauthenticate(current);
  });
  current.on(RoomServerEvent.STATE, (room) => {
    roomActions.state(room);
    syncChat(room);
    // 방에 없으면 볼 게임도 없다(직접 나가기·추방·방 삭제).
    if (!room) gameActions.state(null);
    // 참가자 목록에 없는 관전자도 게임 상태를 요청한다. 시작 시 상태 수신을 놓쳐도 복구한다.
    else if (
      room.status === RoomStatus.PLAYING &&
      useGameStore.getState().snapshot?.status !== GameStatus.PLAYING
    )
      raw(current).emit(GameClientEvent.SYNC, {});
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
  clearTimeout(refreshTimer);
  if (tokenListener) window.removeEventListener('nlmlio:access-token', tokenListener);
  if (focusListener) {
    window.removeEventListener('focus', focusListener);
    document.removeEventListener('visibilitychange', focusListener);
  }
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
 * 성공하면 null을, 실패하거나 지난 요청이 무시됐으면 안내 문구를 돌려준다.
 */
export async function sendGameIntent<E extends GameIntent>(
  event: E,
  payload: Parameters<GameClientToServerEvents[E]>[0],
): Promise<string | null> {
  return emitIntent(event, payload, {
    disconnected: '서버와 연결이 끊겼어요. 다시 연결되면 화면이 맞춰져요.',
    timeout: '서버 응답이 없어요. 현재 상태를 다시 불러올게요.',
    ignored:
      event === GameClientEvent.BELL
        ? '이미 판정된 종이에요. 다음 카드가 공개되면 다시 눌러주세요.'
        : '차례나 판정 상태가 바뀌어 카드를 내지 못했어요.',
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
const reauthentications = new WeakMap<GameSocket, Promise<boolean>>();
const tokenUpdates = new WeakMap<GameSocket, Promise<boolean>>();

function scheduleRefresh(target: GameSocket): void {
  clearTimeout(refreshTimer);
  if (socket !== target || !getAccessToken()) return;
  refreshTimer = setTimeout(
    () => void reauthenticate(target),
    Math.max(1000, accessExpiresAt() - Date.now() - 30_000),
  );
}

/** 인증 정보만 교체하므로 게임 소켓 ID와 방·채팅 구독은 유지한다. */
function updateSocketToken(target: GameSocket): Promise<boolean> {
  const pending = tokenUpdates.get(target);
  if (pending) return pending;
  const token = getAccessToken();
  const updatingToken = (async () => {
    if (socket !== target || !target.connected) return false;
    try {
      const result = await raw(target)
        .timeout(5000)
        .emitWithAck(SocketAuthEvent.REFRESH, { token });
      if (!result.ok) return false;
      chatRoom = null;
      syncChat(useRoomStore.getState().room);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    tokenUpdates.delete(target);
    if (socket === target && token !== getAccessToken()) void updateSocketToken(target);
  });
  tokenUpdates.set(target, updatingToken);
  return updatingToken;
}

function reauthenticate(target: GameSocket): Promise<boolean> {
  const pending = reauthentications.get(target);
  if (pending) return pending;
  const reauthenticating = refreshSession()
    .then(async () => {
      if (socket !== target) return false;
      if (!target.connected) {
        target.connect();
        return false;
      }
      const updated = await updateSocketToken(target);
      if (!updated && socket === target)
        refreshTimer = setTimeout(() => void reauthenticate(target), 5000);
      return updated;
    })
    .catch((error: unknown) => {
      if (socket !== target) return false;
      if (error instanceof ApiError && error.status === 401)
        window.dispatchEvent(new Event('nlmlio:session-expired'));
      else if (socket === target)
        refreshTimer = setTimeout(() => void reauthenticate(target), 5000);
      return false;
    })
    .finally(() => {
      reauthentications.delete(target);
    });
  reauthentications.set(target, reauthenticating);
  return reauthenticating;
}

/** ack를 기다리는 의도 전송. 토큰 만료로 거부되면 재인증 뒤 한 번만 다시 보낸다. */
async function emitIntent(
  event: string,
  payload: unknown,
  messages: {
    disconnected: string;
    timeout: string;
    ignored?: string;
    onTimeout?: (target: GameSocket) => void;
  },
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
    if (result.ok && 'ignored' in result && result.ignored) return messages.ignored ?? null;
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
