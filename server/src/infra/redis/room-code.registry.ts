import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.module';

// 방은 서버 메모리에 있으므로 서버가 재시작돼도 코드가 영원히 묶이지 않게 TTL을 둔다.
const ROOM_CODE_TTL_SECONDS = 24 * 60 * 60;

/** 사용 중인 6자리 방 코드를 Redis `SET NX`로 원자적으로 예약한다(FUNC-003-02). */
@Injectable()
export class RoomCodeRegistry {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async reserve(code: string): Promise<boolean> {
    return (
      (await this.redis.set(`room-code:${code}`, '1', 'EX', ROOM_CODE_TTL_SECONDS, 'NX')) === 'OK'
    );
  }

  async release(code: string): Promise<void> {
    await this.redis.del(`room-code:${code}`);
  }
}
