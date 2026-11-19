import { PlayerStatistics } from '../../src/domain/user/player-statistics';
import { GameSettlement } from '../../src/domain/game/game-settlement';
import type { SettleGameInput } from '@nlmlio/shared';

function game(count: number): SettleGameInput {
  return {
    gameId: 'game-test',
    roomCode: '123456',
    roomName: '테스트',
    startedAt: '2026-10-20T00:00:00Z',
    endedAt: '2026-10-20T00:10:00Z',
    players: Array.from({ length: count }, (_, index) => ({
      userId: index + 1,
      rank: index + 1,
      departed: false,
      bellSuccess: 0,
      bellFail: 0,
      reactionSumMs: 0,
    })),
  };
}

describe('PlayerStatistics', () => {
  it('빈 전적의 백분율은 0이고 반응 시간은 측정 없음이다', () => {
    expect(
      new PlayerStatistics({
        totalGames: 0,
        wins: 0,
        bellSuccess: 0,
        bellFail: 0,
        reactionSumMs: 0,
        departures: 0,
      }).toSnapshot(),
    ).toMatchObject({ winRate: 0, bellSuccessRate: 0, averageReactionMs: null, losses: 0 });
  });

  it('종 성공 횟수로 가중 평균을 계산한다', () => {
    expect(
      new PlayerStatistics({
        totalGames: 3,
        wins: 1,
        bellSuccess: 10,
        bellFail: 4,
        reactionSumMs: 4200,
        departures: 1,
      }).toSnapshot(),
    ).toMatchObject({
      winRate: 33.3,
      bellSuccessRate: 71.4,
      averageReactionMs: 420,
      losses: 2,
      departures: 1,
    });
  });
});

describe('GameSettlement FUNC-005-11', () => {
  it('검증한 순위·이탈·종 기록을 그대로 저장용으로 넘긴다', () => {
    const input = game(3);
    input.players[2].departed = true;
    const snapshot = new GameSettlement(input).snapshot();
    expect(snapshot.playerCount).toBe(3);
    expect(snapshot.players).toEqual(input.players);
  });

  it('중복 순위와 잘못된 반응 속도를 차단한다', () => {
    const input = game(2);
    input.players[1].rank = 1;
    expect(() => new GameSettlement(input)).toThrow();
    input.players[1].rank = 2;
    input.players[0].reactionSumMs = -10;
    expect(() => new GameSettlement(input)).toThrow();
  });
});
