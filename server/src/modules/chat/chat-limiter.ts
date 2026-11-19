import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import Redis from 'ioredis';
import { appError } from '../../common/app-error';
import { REDIS } from '../../infra/redis/redis.module';

const INCREMENT_WITH_TTL = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

@Injectable()
export class ChatLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async text(userId: number): Promise<void> {
    const count = await this.redis.eval(INCREMENT_WITH_TTL, 1, `chat-limit:${userId}`, 3);
    if (Number(count) > 5) throw appError(ErrorCode.RATE_LIMITED);
  }

  async emoji(userId: number): Promise<void> {
    const accepted = await this.redis.set(`emoji:cd:${userId}`, '1', 'EX', 2, 'NX');
    if (accepted !== 'OK') throw appError(ErrorCode.RATE_LIMITED);
  }
}
