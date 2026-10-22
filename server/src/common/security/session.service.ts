import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { REDIS } from '../../infra/redis/redis.module';

// 로그인 한 번이 기기 세션 하나다. 세션마다 키를 따로 두어 한 기기의 회전·로그아웃이
// 다른 기기에 영향을 주지 않게 한다. 값은 현재 유효한 Refresh 토큰의 SHA-256 지문이다.
const sessionKey = (userId: number, sessionId: string) => `refresh:${userId}:${sessionId}`;

@Injectable()
export class SessionService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async save(userId: number, sessionId: string, refreshToken: string, ttl: number): Promise<void> {
    await this.redis.set(sessionKey(userId, sessionId), this.fingerprint(refreshToken), 'EX', ttl);
  }

  async rotate(
    userId: number,
    sessionId: string,
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
      sessionKey(userId, sessionId),
      this.fingerprint(previousToken),
      this.fingerprint(nextToken),
      ttl,
    );
    return result === 1;
  }

  /** 사용자의 모든 기기 세션을 지운다(비밀번호 변경 등). */
  async revokeAll(userId: number): Promise<void> {
    const stream = this.redis.scanStream({ match: sessionKey(userId, '*'), count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.redis.del(...keys);
    }
  }

  async revokeIfMatches(userId: number, sessionId: string, token: string): Promise<void> {
    await this.redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
      1,
      sessionKey(userId, sessionId),
      this.fingerprint(token),
    );
  }
}
