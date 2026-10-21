import type { PlayerStats } from '@nlmlio/shared';

export interface StatisticsTotals {
  totalGames: number;
  wins: number;
  bellSuccess: number;
  bellFail: number;
  reactionSumMs: number;
  departures: number;
}

export class PlayerStatistics {
  constructor(private readonly totals: StatisticsTotals) {}

  toSnapshot(): PlayerStats {
    const { totalGames, wins, bellSuccess, bellFail, reactionSumMs, departures } = this.totals;
    return {
      totalGames,
      wins,
      losses: totalGames - wins,
      winRate: this.percent(wins, totalGames),
      bellSuccess,
      bellFail,
      bellSuccessRate: this.percent(bellSuccess, bellSuccess + bellFail),
      averageReactionMs: bellSuccess > 0 ? Math.round(reactionSumMs / bellSuccess) : null,
      departures,
    };
  }

  private percent(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  }
}
