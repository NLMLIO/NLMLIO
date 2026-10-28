import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ChatMessageEvent, EmojiMessageEvent } from '@nlmlio/shared';
import Redis from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module';

export type ChatBroadcast =
  { kind: 'text'; event: ChatMessageEvent } | { kind: 'emoji'; event: EmojiMessageEvent };

/** 채팅은 Pub/Sub으로만 전달한다. 메시지와 이모티콘을 Redis/DB에 저장하지 않는다. */
@Injectable()
export class ChatPubSub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPubSub.name);
  private readonly subscriber: Redis;
  private receiver: (message: ChatBroadcast) => Promise<void> = async () => {};

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.subscriber = redis.duplicate();
  }

  async onModuleInit(): Promise<void> {
    this.subscriber.on('pmessage', (_pattern, channel, raw) => {
      try {
        const message = JSON.parse(raw) as ChatBroadcast;
        if (
          !/^chat:\d{6}$/.test(channel) ||
          !message ||
          (message.kind !== 'text' && message.kind !== 'emoji') ||
          message.event.roomCode !== channel.slice(5)
        )
          return;
        void this.receiver(message).catch((error: unknown) => {
          this.logger.error(error instanceof Error ? error.name : 'Pub/Sub delivery error');
        });
      } catch {
        this.logger.warn('Invalid chat Pub/Sub payload');
      }
    });
    await this.subscriber.psubscribe('chat:*');
  }

  register(receiver: (message: ChatBroadcast) => Promise<void>): void {
    this.receiver = receiver;
  }

  async publish(message: ChatBroadcast): Promise<void> {
    await this.redis.publish(`chat:${message.event.roomCode}`, JSON.stringify(message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }
}
