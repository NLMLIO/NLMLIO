import { Injectable } from '@nestjs/common';
import { ChatEmoji, ErrorCode, RoomRole } from '@nlmlio/shared';
import type { ChatEmojiCode } from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import type { UserAccount } from '../../domain/user/account';
import { RoomService } from '../room/room.service';
import { ChatLimiter } from './chat-limiter';
import { ChatPubSub } from './chat-pubsub';

@Injectable()
export class ChatService {
  constructor(
    private readonly rooms: RoomService,
    private readonly limiter: ChatLimiter,
    private readonly pubsub: ChatPubSub,
  ) {}

  roomCode(userId: number): string | null {
    return this.rooms.memberRoom(userId)?.code ?? null;
  }

  join(userId: number, code: string): void {
    if (this.roomCode(userId) !== code) throw appError(ErrorCode.NOT_IN_ROOM);
  }

  async text(account: UserAccount, message: unknown): Promise<void> {
    const room = this.rooms.memberRoom(account.id);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    if (typeof message !== 'string' || !message.trim() || [...message.trim()].length > 200)
      throw appError(ErrorCode.CHAT_TOO_LONG);
    await this.limiter.text(account.id);
    await this.pubsub.publish({
      kind: 'text',
      event: {
        roomCode: room.code,
        userId: account.id,
        nickname: account.nickname,
        isSpectator: room.members.some(
          (member) => member.userId === account.id && member.role === RoomRole.SPECTATOR,
        ),
        message: message.trim(),
        sentAt: new Date().toISOString(),
      },
    });
  }

  async emoji(account: UserAccount, emoji: ChatEmojiCode): Promise<void> {
    const room = this.rooms.memberRoom(account.id);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    if (!Object.hasOwn(ChatEmoji, emoji)) throw appError(ErrorCode.VALIDATION_FAILED);
    await this.limiter.emoji(account.id);
    await this.pubsub.publish({
      kind: 'emoji',
      event: {
        roomCode: room.code,
        userId: account.id,
        nickname: account.nickname,
        isSpectator: room.members.some(
          (member) => member.userId === account.id && member.role === RoomRole.SPECTATOR,
        ),
        emoji,
        sentAt: new Date().toISOString(),
      },
    });
  }
}
