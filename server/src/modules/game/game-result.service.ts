import { Injectable } from '@nestjs/common';
import type { SettleGameInput } from '@nlmlio/shared';
import { GameSettlement } from '../../domain/game/game-settlement';
import { GameResultRepository } from '../../infra/database/game-result.repository';

@Injectable()
export class GameResultService {
  constructor(private readonly results: GameResultRepository) {}

  /** 게임 엔진의 종료 처리에서 호출한다. HTTP로 결과·포인트를 받지 않는다. */
  settle(input: SettleGameInput): Promise<{ saved: boolean }> {
    return this.results.settle(new GameSettlement(input));
  }
}
