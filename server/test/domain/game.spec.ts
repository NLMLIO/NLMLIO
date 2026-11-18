import { ErrorCode, Fruit, GamePlayerStatus, ROUND_RESULT_MS } from '@nlmlio/shared';
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
  it('합이 5가 아니면 자기 카드 1장만 보관하고 공개 테이블을 유지한다', () => {
    const game = start(eight());
    game.play(1, game.turnId, 10);
    const oldTurn = game.turnId;
    expect(game.ring(1, game.turnSeq, 20)).toMatchObject({ success: false, movedCards: 1 });
    expect(game.checkpoint().pile).toEqual(['B1']);
    expect(game.snapshot().players.map((player) => player.tableCount)).toEqual([1, 0]);
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
  it('결과 표시 중 카드 입력은 무시하고 종료 시점부터 온전한 10초를 준다', () => {
    const game = start(eight());
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    game.ring(1, game.turnSeq, 30);
    const before = game.snapshot();
    expect(before.roundResumeAt).toBe(30 + ROUND_RESULT_MS);
    expect(before.turnDeadline).toBe(30 + ROUND_RESULT_MS + 10_000);
    expect(game.play(1, game.turnId, 30 + ROUND_RESULT_MS - 1)).toBeNull();
    expect(game.snapshot()).toEqual(before);
    expect(game.play(1, game.turnId, 30 + ROUND_RESULT_MS)).toMatchObject({ kind: 'card' });
    expect(game.snapshot().roundResumeAt).toBeNull();
    expect(total(game)).toBe(8);
  });
  it('오발 직후 중복 종은 벌칙을 반복하지 않고 다음 정상 종은 테이블과 벌칙 카드를 받는다', () => {
    const game = start(eight());
    game.play(1, game.turnId, 10);
    game.ring(1, game.turnSeq, 20);
    expect(game.ring(2, game.turnSeq, 21)).toBeNull();
    expect(game.snapshot().pileCount).toBe(1);
    expect(game.snapshot().players[0].topCard).toEqual({ fruit: Fruit.STRAWBERRY, count: 2 });
    game.play(2, game.turnId, 20 + ROUND_RESULT_MS);
    expect(game.ring(2, game.turnSeq, 21 + ROUND_RESULT_MS)).toMatchObject({
      success: true,
      movedCards: 3,
    });
    expect(game.snapshot().pileCount).toBe(0);
    expect(total(game)).toBe(8);
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
  it('마지막 카드를 내도 바로 탈락하지 않고, 차례에서만 빠진 채 종을 칠 수 있다', () => {
    // 분배: 1번 [딸기2, 바나나1], 2번 [딸기3, 바나나1]
    const game = start(
      new Deck([
        card(Fruit.STRAWBERRY, 2),
        card(Fruit.STRAWBERRY, 3),
        card(Fruit.BANANA, 1),
        card(Fruit.BANANA, 1),
      ]),
    );
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    expect(game.ring(2, game.turnSeq, 30)).toMatchObject({ success: true, movedCards: 2 });
    game.play(2, game.turnId, 40 + ROUND_RESULT_MS);
    game.play(1, game.turnId, 50 + ROUND_RESULT_MS);
    // 1번은 덱 0장이지만 탈락하지 않고 테이블 카드도 남는다
    expect(game.snapshot().players[0]).toMatchObject({
      status: GamePlayerStatus.ACTIVE,
      handCount: 0,
      topCard: { fruit: Fruit.BANANA, count: 1 },
    });
    // 카드가 남은 2번만 차례를 받아 혼자 연속으로 낸다
    expect(game.snapshot()).toMatchObject({ status: 'PLAYING', turnUserId: 2 });
    game.play(2, game.turnId, 60 + ROUND_RESULT_MS);
    expect(game.snapshot()).toMatchObject({ status: 'PLAYING', turnUserId: 2 });
    expectRule(() => game.play(1, game.turnId, 70 + ROUND_RESULT_MS), ErrorCode.NOT_YOUR_TURN);
    // 1번이 종을 쳤지만 오발 → 테이블이 정리된 뒤에도 0장이므로 그 판정에서 탈락한다
    expect(game.ring(1, game.turnSeq, 80 + ROUND_RESULT_MS)).toMatchObject({ success: false });
    expect(game.snapshot().players[0].status).toBe(GamePlayerStatus.ELIMINATED);
    expect(game.snapshot().status).toBe('ENDED');
    expect(game.snapshot().results.map((player) => [player.userId, player.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(total(game)).toBe(4);
  });
  it('덱 0장인 플레이어가 종에 성공하면 카드를 받아 다시 차례에 들어오고, 못 받은 0장 플레이어는 탈락한다', () => {
    // 1명당 1장, 남은 1장은 보관 스택
    const game = start(
      new Deck([card(Fruit.STRAWBERRY, 2), card(Fruit.STRAWBERRY, 3), card(Fruit.PLUM, 1)]),
    );
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    // 아무도 낼 카드가 없어도 바로 끝나지 않고 종 기회(차례 없음, 10초)를 준다
    expect(game.snapshot()).toMatchObject({
      status: 'PLAYING',
      turnUserId: null,
      turnDeadline: 20 + 10_000,
    });
    expect(game.ring(1, game.turnSeq, 30)).toMatchObject({ success: true, movedCards: 3 });
    expect(game.snapshot().players[0]).toMatchObject({
      status: GamePlayerStatus.ACTIVE,
      handCount: 3,
    });
    expect(game.snapshot().players[1].status).toBe(GamePlayerStatus.ELIMINATED);
    expect(game.snapshot().status).toBe('ENDED');
    expect(game.snapshot().results[0].userId).toBe(1);
    expect(total(game)).toBe(3);
  });
  it('모두 덱이 떨어지고 10초 안에 아무도 종을 치지 않으면 마지막으로 카드를 낸 사람이 이긴다', () => {
    const game = start(
      new Deck([card(Fruit.BANANA, 1), card(Fruit.LIME, 1), card(Fruit.PLUM, 1)]),
      3,
    );
    game.play(1, game.turnId, 10);
    game.play(2, game.turnId, 20);
    game.play(3, game.turnId, 30);
    expect(game.snapshot()).toMatchObject({ status: 'PLAYING', turnUserId: null });
    expect(game.timeout(game.turnId, 30 + 9_999)).toBeNull();
    expect(game.status).toBe('PLAYING');
    const version = game.version;
    expect(game.timeout(game.turnId, 30 + 10_000)).toBeNull();
    expect(game.version).toBe(version + 1);
    expect(game.snapshot()).toMatchObject({
      status: 'ENDED',
      turnUserId: null,
      turnDeadline: null,
    });
    // 먼저 덱이 떨어진 사람일수록 아래 순위
    expect(game.snapshot().results.map((player) => [player.userId, player.rank])).toEqual([
      [3, 1],
      [2, 2],
      [1, 3],
    ]);
    expect(total(game)).toBe(3);
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
    game.play(4, game.turnId, 40);
    game.timeout(game.turnId, game.turnDeadline!);
    expect(
      game.snapshot().results.map((player) => [player.userId, player.rank, player.departed]),
    ).toEqual([
      [4, 1, false],
      [3, 2, false],
      [1, 3, false],
      [2, 4, true],
    ]);
    expect(game.depart(2, 50)).toBeNull();
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
        if (game.turnUserId === null) game.timeout(game.turnId, game.turnDeadline!);
        else game.play(game.turnUserId, game.turnId, ++now);
        expect(total(game)).toBe(56);
      }
      const results = game.snapshot().results;
      expect(results).toHaveLength(count);
      expect(new Set(results.map((player) => player.rank)).size).toBe(count);
      expect(game.checkpoint().order).toHaveLength(1);
    }
  });
});
