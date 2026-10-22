import { Injectable } from '@nestjs/common';
import type { RankingEntry } from '@nlmlio/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

interface StandingRow {
  userId: number;
  nickname: string;
  wins: bigint;
  losses: bigint;
  rank: bigint;
}

// 목록과 내 순위가 같은 승패 집계와 동률 기준을 사용한다.
const standings = Prisma.sql`
  WITH records AS (
    SELECT "userId",
      COUNT(*) FILTER (WHERE "rank" = 1 AND NOT "departed") AS wins,
      COUNT(*) FILTER (WHERE "rank" <> 1 OR "departed") AS losses
    FROM "GameResult"
    GROUP BY "userId"
  ), standings AS (
    SELECT u.id AS "userId", u.nickname,
      COALESCE(r.wins, 0) AS wins,
      COALESCE(r.losses, 0) AS losses,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(r.wins, 0) DESC, COALESCE(r.losses, 0) ASC,
          u."createdAt" ASC, u.id ASC
      ) AS rank
    FROM "User" u
    LEFT JOIN records r ON r."userId" = u.id
  )
`;

function toEntry(row: StandingRow): RankingEntry {
  return {
    userId: row.userId,
    nickname: row.nickname,
    wins: Number(row.wins),
    losses: Number(row.losses),
    rank: Number(row.rank),
  };
}

@Injectable()
export class RankingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async standingOf(userId: number): Promise<RankingEntry | null> {
    const rows = await this.prisma.$queryRaw<StandingRow[]>`
      ${standings} SELECT * FROM standings WHERE "userId" = ${userId}
    `;
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async ranking(userId: number, page: number, pageSize: number) {
    const [rows, ownRows, total] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<StandingRow[]>`
          ${standings} SELECT * FROM standings ORDER BY rank
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `,
        this.prisma.$queryRaw<StandingRow[]>`
          ${standings} SELECT * FROM standings WHERE "userId" = ${userId}
        `,
        this.prisma.user.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map(toEntry),
      me: ownRows[0] ? toEntry(ownRows[0]) : null,
      total,
    };
  }
}
