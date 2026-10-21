import { Injectable } from '@nestjs/common';
import { GameSettlement } from '../../domain/game/game-settlement';
import { PrismaService } from './prisma.service';
import { uniqueConflict } from './user.repository';

@Injectable()
export class GameResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async settle(settlement: GameSettlement): Promise<{ saved: boolean }> {
    const result = settlement.snapshot();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.game.create({
          data: {
            id: result.gameId,
            roomCode: result.roomCode,
            roomName: result.roomName,
            playerCount: result.playerCount,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
          },
        });
        const reachedAt = new Date();
        // Lock/update users in a deterministic order to avoid deadlocks across simultaneous games.
        for (const player of [...result.players].sort(
          (first, second) => first.userId - second.userId,
        )) {
          await tx.gameResult.create({
            data: {
              ...player,
              userId: player.userId,
              gameId: result.gameId,
              playedAt: result.endedAt,
            },
          });
          if (player.pointDelta > 0) {
            await tx.user.update({
              where: { id: player.userId },
              data: {
                point: { increment: player.pointDelta },
                pointReachedAt: reachedAt,
              },
            });
          }
        }
      });
      return { saved: true };
    } catch (error) {
      if (
        uniqueConflict(error) &&
        (await this.prisma.game.count({ where: { id: result.gameId } }))
      ) {
        return { saved: false };
      }
      throw error;
    }
  }
}
