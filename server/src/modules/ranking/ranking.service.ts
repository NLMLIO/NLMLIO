import { Injectable } from '@nestjs/common';
import type { HistoryResponse, RankingResponse } from '@nlmlio/shared';
import type { UserAccount } from '../../domain/user/account';
import { PlayerStatistics } from '../../domain/user/player-statistics';
import { HistoryRepository } from '../../infra/database/history.repository';
import { UserRepository } from '../../infra/database/user.repository';

@Injectable()
export class RankingService {
  constructor(
    private readonly users: UserRepository,
    private readonly results: HistoryRepository,
  ) {}

  async history(userId: number, page: number, pageSize: number): Promise<HistoryResponse> {
    const [result, totals] = await Promise.all([
      this.results.history(userId, page, pageSize),
      this.results.totals(userId),
    ]);
    return {
      ...result,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
      stats: new PlayerStatistics(totals).toSnapshot(),
    };
  }

  async ranking(account: UserAccount, page: number, pageSize: number): Promise<RankingResponse> {
    const [result, rank] = await Promise.all([
      this.users.ranking(page, pageSize),
      this.users.rankOf(account),
    ]);
    return {
      items: result.items.map((user, index) => ({
        userId: user.id,
        nickname: user.nickname,
        point: user.point,
        rank: (page - 1) * pageSize + index + 1,
      })),
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
      me: { userId: account.id, nickname: account.nickname, point: account.point, rank },
    };
  }
}
