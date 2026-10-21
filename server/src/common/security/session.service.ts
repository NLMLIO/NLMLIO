import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { REDIS } from '../../infra/redis/redis.module';

@Injectable()
export class SessionService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async save(userId: number, refreshToken: string, ttl: number): Promise<void> {
    await this.redis.set(`refresh:${userId}`, this.fingerprint(refreshToken), 'EX', ttl);
  }

  async rotate(
    userId: number,
    previousToken: string,
    nextToken: string,
    ttl: number,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then
         redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
         return 1
       end
       return 0`,
      1,
      `refresh:${userId}`,
      this.fingerprint(previousToken),
      this.fingerprint(nextToken),
      ttl,
    );
    return result === 1;
  }

  async revoke(userId: number): Promise<void> {
    await this.redis.del(`refresh:${userId}`);
  }

  async revokeIfMatches(userId: number, token: string): Promise<void> {
    await this.redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
      1,
      `refresh:${userId}`,
      this.fingerprint(token),
    );
  }
}
