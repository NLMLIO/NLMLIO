import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import type { HistoryResponse, RankingResponse } from '@nlmlio/shared';
import type { UserAccount } from '../../domain/user/account';
import { PlayerStatistics } from '../../domain/user/player-statistics';
import { HistoryRepository } from '../../infra/database/history.repository';
import { RankingRepository } from '../../infra/database/ranking.repository';
import { appError } from '../../common/app-error';

@Injectable()
export class RankingService {
  constructor(
    private readonly standings: RankingRepository,
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
    const result = await this.standings.ranking(account.id, page, pageSize);
    if (!result.me) throw appError(ErrorCode.USER_NOT_FOUND);
    return {
      items: result.items,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
      me: result.me,
    };
  }
}
