import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { GameCheckpoint } from '../../domain/game/game';
import { REDIS } from './redis.module';

/** 게임 객체의 내부 상태를 명세의 Redis 키에 원자적으로 미러링한다. */
@Injectable()
export class GameStateRepository {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async save(state: GameCheckpoint): Promise<void> {
    const base = `game:${state.gameId}`;
    const keys = [base, `${base}:order`, `${base}:pile`, `${base}:out`];
    const tx = this.redis.multi();
    tx.hset(base, {
      roomCode: state.roomCode,
      status: state.status,
      round: state.round,
      turnUserId: state.turnUserId ?? '',
      turnSeq: state.turnSeq,
      turnId: state.turnId,
      lastPlayAt: state.lastPlayAt ?? '',
      startedAt: state.startedAt,
    });
    for (const [suffix, values] of [
      ['order', state.order],
      ['pile', state.pile],
      ['out', state.out],
    ] as const) {
      tx.del(`${base}:${suffix}`);
      if (values.length) tx.rpush(`${base}:${suffix}`, ...values);
    }
    for (const player of state.players) {
      const hand = `${base}:hand:${player.userId}`;
      const table = `${base}:table:${player.userId}`;
      const stat = `${base}:stat:${player.userId}`;
      keys.push(hand, table, stat);
      tx.del(hand, table);
      if (player.hand.length) tx.rpush(hand, ...player.hand);
      if (player.table.length) tx.rpush(table, ...player.table);
      tx.hset(stat, {
        bellSuccess: player.bellSuccess,
        bellFail: player.bellFail,
        reactionSum: player.reactionSumMs,
      });
    }
    tx.sadd(`${base}:keys`, ...keys);
    const result = await tx.exec();
    const failure = result?.find(([error]) => error)?.[0];
    if (!result || failure) throw failure ?? new Error('Redis snapshot transaction failed');
  }
  async claimBell(gameId: string, turnSeq: number, userId: number): Promise<boolean> {
    const key = `game:${gameId}:bell:${turnSeq}`;
    const won = await this.redis.eval(
      `
      if redis.call('SET', KEYS[1], ARGV[1], 'EX', 10, 'NX') then
        redis.call('SADD', KEYS[2], KEYS[1])
        return 1
      end
      return 0`,
      2,
      key,
      `game:${gameId}:keys`,
      userId,
    );
    return won === 1;
  }
  async clear(gameId: string): Promise<void> {
    const index = `game:${gameId}:keys`;
    const keys = await this.redis.smembers(index);
    await this.redis.del(index, `game:${gameId}`, ...keys);
    await this.redis.set(`settled:${gameId}`, '1', 'EX', 86400);
  }
}
