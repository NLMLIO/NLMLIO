import { ErrorCode, Fruit, GamePlayerStatus } from '@nlmlio/shared';
import { Card, Deck } from '../../src/domain/card/deck';
import { Game, GameRuleError } from '../../src/domain/game/game';
import { Table } from '../../src/domain/game/table';

const card = (fruit: Fruit, count: 1 | 2 | 3 | 4 | 5) => new Card(fruit, count);
const start = (deck: Deck, count = 2) =>
  Game.create(
    {
      gameId: 'test-game',
      roomCode: '123456',
      roomName: '게임',
      players: Array.from({ length: count }, (_, index) => ({
        userId: index + 1,
        nickname: `회원${index + 1}`,
      })),
      now: 0,
    },
    deck,
  );
const total = (game: Game) => {
  const state = game.checkpoint();
  return (
    state.pile.length +
    state.players.reduce((sum, player) => sum + player.hand.length + player.table.length, 0)
  );
};
const expectRule = (action: () => unknown, code: ErrorCode) => {
  try {
    action();
    throw new Error('Expected rule error');
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError);
    expect((error as GameRuleError).code).toBe(code);
  }
};
const eight = () =>
  new Deck([
    card(Fruit.STRAWBERRY, 2),
    card(Fruit.STRAWBERRY, 3),
    card(Fruit.BANANA, 1),
    card(Fruit.BANANA, 2),
    card(Fruit.LIME, 1),
    card(Fruit.LIME, 2),
    card(Fruit.PLUM, 1),
    card(Fruit.PLUM, 2),
  ]);

describe('Deck / Table (FUNC-005-02,05)', () => {
  it('과일마다 14장, 총 56장과 명세의 장수 분포를 만든다', () => {
    const { hands } = Deck.standard().deal(2);
    const codes = hands.flat().map((entry) => entry.code());
    expect(codes).toHaveLength(56);
    for (const prefix of ['S', 'B', 'L', 'P'])
      expect(
        [1, 2, 3, 4, 5].map((count) => codes.filter((code) => code === `${prefix}${count}`).length),
      ).toEqual([5, 3, 3, 2, 1]);
  });
  it.each([
    [2, 0],
    [3, 2],
    [4, 0],
    [5, 1],
    [6, 2],
  ])('%i명에게 공평하게 나누고 나머지를 보관한다', (count, remainder) => {
    const deal = Deck.standard().deal(count);
    expect(new Set(deal.hands.map((hand) => hand.length)).size).toBe(1);
    expect(deal.remainder).toHaveLength(remainder);
    expect(deal.hands.flat().length + deal.remainder.length).toBe(56);
  });
  it('셔플은 카드 수와 종류를 보존하고 원본 배열을 바꾸지 않는다', () => {
    const cards = eight().deal(2).hands.flat();
    const before = cards.map((entry) => entry.code());
    const after = new Deck(cards)
      .shuffle(() => 0)
      .deal(2)
      .hands.flat()
      .map((entry) => entry.code());
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
    expect(cards.map((entry) => entry.code())).toEqual(before);
    expect(() => new Deck(cards).shuffle(() => 1)).toThrow();
  });
  it('맨 위 카드만 합계에 포함하고 수거할 때는 밑에 쌓인 카드도 모두 가져간다', () => {
    const table = new Table([1, 2]);
    table.play(1, card(Fruit.STRAWBERRY, 5));
    table.play(1, card(Fruit.BANANA, 2));
    table.play(2, card(Fruit.BANANA, 3));
    expect(table.totals()).toMatchObject({ STRAWBERRY: 0, BANANA: 5 });
    expect(table.collect()).toHaveLength(3);
    expect(Object.values(table.totals()).every((count) => count === 0)).toBe(true);
  });
});

describe('Game (FUNC-005-01~13,15,16)', () => {
  it('공개 상태에는 보유 덱 내용이 없고 내부 체크포인트에만 있다', () => {
    const game = start(eight());
    expect(game.snapshot().players[0]).toMatchObject({ handCount: 4, topCard: null });
    expect(game.snapshot().players[0]).not.toHaveProperty('hand');
    expect(game.checkpoint().players[0].hand).toEqual(['S2', 'B1', 'L1', 'P1']);
  });
  it('자기 차례와 관전자 권한을 검사하고 같은 카드 요청은 한 번만 처리한다', () => {
    const game = start(eight());
    expectRule(() => game.play(2, 1, 1), ErrorCode.NOT_YOUR_TURN);
    expectRule(() => game.play(99, 1, 1), ErrorCode.SPECTATOR_FORBIDDEN);
    expect(game.play(1, 1, 10)?.kind).toBe('card');
    expect(game.play(1, 1, 11)).toBeNull();
    expect(game.snapshot()).toMatchObject({ turnUserId: 2, turnSeq: 1, turnId: 2, lastPlayAt: 10 });
    expect(total(game)).toBe(8);
  });
  it('정확히 5개일 때 최초 종만 인정하고 테이블·보관 카드를 덱 아래에 넣는다', () => {
    const game = start(eight());
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    const seq = game.turnSeq;
    expect(game.ring(1, seq, 50)).toMatchObject({ kind: 'bell', success: true, movedCards: 2 });
    expect(game.ring(2, seq, 51)).toBeNull();
    expect(game.checkpoint().players[0].hand).toEqual(['B1', 'L1', 'P1', 'S2', 'S3']);
    expect(game.checkpoint().players[0]).toMatchObject({ bellSuccess: 1, reactionSumMs: 30 });
    expect(game.snapshot().turnUserId).toBe(1);
    expect(game.snapshot().pileCount).toBe(0);
    expect(total(game)).toBe(8);
  });
  it('합이 5가 아니면 자기 카드 1장과 테이블 전체를 보관 스택으로 옮긴다', () => {
    const game = start(eight());
    game.play(1, game.turnId, 10);
    const oldTurn = game.turnId;
    expect(game.ring(1, game.turnSeq, 20)).toMatchObject({ success: false, movedCards: 2 });
    expect(game.checkpoint().pile).toEqual(['B1', 'S2']);
    expect(game.snapshot().players.map((player) => player.tableCount)).toEqual([0, 0]);
    expect(game.checkpoint().players[0]).toMatchObject({ bellFail: 1 });
    expect(game.play(2, oldTurn, 21)).toBeNull();
    expect(total(game)).toBe(8);
  });
  it('과일 합이 6이면 성공으로 판정하지 않는다', () => {
    const game = start(new Deck(Array.from({ length: 8 }, () => card(Fruit.STRAWBERRY, 3))));
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    expect(game.ring(1, game.turnSeq, 30)).toMatchObject({ success: false });
  });
  it('나눠 주고 남긴 카드도 정상 종 승자가 테이블 카드와 함께 가져간다', () => {
    const game = start(
      new Deck([
        card(Fruit.STRAWBERRY, 2),
        card(Fruit.STRAWBERRY, 3),
        card(Fruit.BANANA, 1),
        card(Fruit.LIME, 1),
        card(Fruit.PLUM, 1),
        card(Fruit.BANANA, 2),
        card(Fruit.STRAWBERRY, 5),
        card(Fruit.LIME, 5),
      ]),
      3,
    );
    expect(game.snapshot().pileCount).toBe(2);
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    expect(game.ring(3, game.turnSeq, 30)).toMatchObject({ success: true, movedCards: 4 });
    expect(game.snapshot().pileCount).toBe(0);
    expect(game.snapshot().players[2].handCount).toBe(6);
    expect(total(game)).toBe(8);
  });
  it('마지막 카드가 나가면 테이블까지 보관하고 탈락시킨 뒤 최종 순위를 만든다', () => {
    const game = start(new Deck([card(Fruit.LIME, 5), card(Fruit.PLUM, 1)]));
    game.play(1, game.turnId, 10);
    expect(game.snapshot()).toMatchObject({
      status: 'ENDED',
      turnUserId: null,
      turnDeadline: null,
      pileCount: 1,
    });
    expect(game.snapshot().players[0]).toMatchObject({ status: 'ELIMINATED', topCard: null });
    expect(game.snapshot().results.map((player) => [player.userId, player.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    const revision = game.snapshot().revision;
    game.confirmSettlement();
    expect(game.snapshot()).toMatchObject({ settled: true, revision: revision + 1 });
    game.confirmSettlement();
    expect(game.snapshot().revision).toBe(revision + 1);
    expect(total(game)).toBe(2);
  });
  it('오발 벌칙으로 0장이 되면 탈락하고 남은 플레이어가 승리한다', () => {
    const game = start(new Deck([card(Fruit.LIME, 5), card(Fruit.PLUM, 1)]));
    expect(game.ring(1, 0, 10)).toMatchObject({ success: false, movedCards: 1 });
    expect(game.snapshot().status).toBe('ENDED');
    expect(game.snapshot().results[0].userId).toBe(2);
    expect(total(game)).toBe(2);
  });
  it('이탈도 발생 시점의 탈락 순서에 포함하고 이탈자에게는 0점을 지급한다', () => {
    const game = start(new Deck(Array.from({ length: 4 }, () => card(Fruit.BANANA, 1))), 4);
    game.play(1, game.turnId, 10);
    game.depart(2, 20);
    game.play(3, game.turnId, 30);
    expect(
      game.snapshot().results.map((player) => [player.userId, player.rank, player.pointDelta]),
    ).toEqual([
      [4, 1, 38],
      [3, 2, 19],
      [2, 3, 0],
      [1, 4, 10],
    ]);
    expect(game.depart(2, 40)).toBeNull();
    expect(total(game)).toBe(4);
  });
  it('10초 전에는 자동으로 내지 않고 세 번 연속 자동 내기 시 이탈한다', () => {
    const game = start(Deck.standard());
    expect(game.timeout(game.turnId, 9999)).toBeNull();
    for (let i = 0; i < 3; i++) {
      game.timeout(game.turnId, game.turnDeadline!);
      if (game.status === 'PLAYING') game.play(2, game.turnId, game.turnDeadline! - 1);
    }
    expect(game.snapshot().players[0]).toMatchObject({
      status: GamePlayerStatus.DEPARTED,
      automaticTurns: 3,
    });
    expect(game.snapshot().results[1].pointDelta).toBe(0);
    expect(total(game)).toBe(56);
  });
  it('직접 내면 연속 자동 횟수가 초기화되고 지난 타이머는 무시한다', () => {
    const game = start(Deck.standard());
    const previous = game.turnId;
    game.timeout(previous, 10000);
    expect(game.timeout(previous, 20000)).toBeNull();
    game.play(2, game.turnId, 10001);
    game.play(1, game.turnId, 10002);
    expect(game.snapshot().players[0].automaticTurns).toBe(0);
  });
  it('각 인원수의 전체 경기를 진행해 카드 56장 보존과 중복 없는 순위를 검증한다', () => {
    for (let count = 2; count <= 6; count++) {
      const game = start(
        Deck.standard().shuffle(() => 0.42),
        count,
      );
      let now = 0;
      while (game.status === 'PLAYING') {
        game.play(game.turnUserId!, game.turnId, ++now);
        expect(total(game)).toBe(56);
      }
      const results = game.snapshot().results;
      expect(results).toHaveLength(count);
      expect(new Set(results.map((player) => player.rank)).size).toBe(count);
      expect(game.checkpoint().order).toHaveLength(1);
    }
  });
});
