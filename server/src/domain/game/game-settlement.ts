import type { SettleGameInput } from '@nlmlio/shared';

/** 최종 순위는 게임 엔진이 확정한다. 정산 객체는 저장 전 결과 검증만 맡는다. */
export class GameSettlement {
  constructor(private readonly result: SettleGameInput) {
    const players = result.players;
    const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
    if (
      !result.gameId ||
      !/^\d{6}$/.test(result.roomCode) ||
      !result.roomName.trim() ||
      result.roomName.length > 80 ||
      players.length < 2 ||
      players.length > 6 ||
      new Set(players.map((player) => player.userId)).size !== players.length ||
      new Set(players.map((player) => player.rank)).size !== players.length ||
      players.some(
        (player) =>
          !integer(player.userId) ||
          player.userId === 0 ||
          !integer(player.rank) ||
          player.rank < 1 ||
          player.rank > players.length ||
          !integer(player.bellSuccess) ||
          !integer(player.bellFail) ||
          !integer(player.reactionSumMs) ||
          typeof player.departed !== 'boolean' ||
          (!player.bellSuccess && player.reactionSumMs !== 0),
      ) ||
      !Number.isFinite(Date.parse(result.startedAt)) ||
      !Number.isFinite(Date.parse(result.endedAt)) ||
      Date.parse(result.startedAt) > Date.parse(result.endedAt)
    ) {
      throw new Error('Invalid game settlement');
    }
  }

  snapshot() {
    const result = this.result;
    return {
      gameId: result.gameId,
      roomCode: result.roomCode,
      roomName: result.roomName,
      playerCount: result.players.length,
      startedAt: new Date(result.startedAt),
      endedAt: new Date(result.endedAt),
      players: result.players.map((player) => ({ ...player })),
    };
  }
}
