import { Injectable } from '@nestjs/common';
import type { GameHistoryItem } from '@nlmlio/shared';
import type { StatisticsTotals } from '../../domain/user/player-statistics';
import { PrismaService } from './prisma.service';

@Injectable()
export class HistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async totals(userId: number): Promise<StatisticsTotals> {
    const [sum, wins, departures] = await this.prisma.$transaction(
      [
        this.prisma.gameResult.aggregate({
          where: { userId },
          _count: true,
          _sum: { bellSuccess: true, bellFail: true, reactionSumMs: true },
        }),
        this.prisma.gameResult.count({ where: { userId, rank: 1, departed: false } }),
        this.prisma.gameResult.count({ where: { userId, departed: true } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      totalGames: sum._count,
      wins,
      departures,
      bellSuccess: sum._sum.bellSuccess ?? 0,
      bellFail: sum._sum.bellFail ?? 0,
      reactionSumMs: sum._sum.reactionSumMs ?? 0,
    };
  }

  async history(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: GameHistoryItem[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.gameResult.findMany({
          where: { userId },
          include: { game: true },
          orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.gameResult.count({ where: { userId } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      total,
      items: rows.map((row) => ({
        gameId: row.gameId,
        roomName: row.game.roomName,
        playedAt: row.playedAt.toISOString(),
        players: row.game.playerCount,
        rank: row.rank,
        point: row.pointDelta,
        departed: row.departed,
      })),
    };
  }
}
