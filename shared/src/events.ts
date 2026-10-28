import type { ErrorCode } from './errors';

export const ChatEvent = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
  SEND: 'chat:send',
  MESSAGE: 'chat:message',
  EMOJI_SEND: 'emoji:send',
  EMOJI: 'emoji:message',
  ERROR: 'chat:error',
} as const;

/** 클라이언트는 코드만 보내고, 화면에 보일 글리프는 이 공용 목록에서 얻는다. */
export const ChatEmoji = {
  JOY: '😂',
  SAD: '😢',
  WOW: '😮',
  CLAP: '👏',
  LIKE: '👍',
} as const;

export type ChatEmojiCode = keyof typeof ChatEmoji;
export interface ChatJoinRequest {
  code: string;
}
export interface ChatSendRequest {
  message: string;
}
export interface EmojiSendRequest {
  emoji: ChatEmojiCode;
}
export type ChatAck = { ok: true } | { ok: false; code: ErrorCode };
export interface ChatErrorEvent {
  code: ErrorCode;
}
export interface ChatMessageEvent {
  roomCode: string;
  userId: number;
  nickname: string;
  isSpectator: boolean;
  message: string;
  sentAt: string;
}
export interface EmojiMessageEvent {
  roomCode: string;
  userId: number;
  nickname: string;
  isSpectator: boolean;
  emoji: ChatEmojiCode;
  sentAt: string;
}
