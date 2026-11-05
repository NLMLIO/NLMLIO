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
        await tx.gameResult.createMany({
          data: result.players.map((player) => ({
            ...player,
            gameId: result.gameId,
            playedAt: result.endedAt,
          })),
        });
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
