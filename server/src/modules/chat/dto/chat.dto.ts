import { Allow, IsIn, IsString, Matches } from 'class-validator';
import { ChatEmoji } from '@nlmlio/shared';

export class ChatJoinDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ChatSendDto {
  @Allow()
  message!: unknown;
}

export class EmojiSendDto {
  @IsIn(Object.keys(ChatEmoji))
  emoji!: keyof typeof ChatEmoji;
}
