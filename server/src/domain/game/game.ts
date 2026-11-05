import { ErrorCode, GamePlayerStatus, GameStatus, TURN_TIME_MS } from '@nlmlio/shared';
import type { GameAction, GameSnapshot, SettleGameInput } from '@nlmlio/shared';
import { Card, Deck } from '../card/deck';
import { GamePlayer } from '../player/game-player';
import { GameSettlement } from './game-settlement';
import { Table } from './table';

export { TURN_TIME_MS };
export interface StartGameInput {
  gameId: string;
  roomCode: string;
  roomName: string;
  players: { userId: number; nickname: string }[];
  now: number;
}
export class GameRuleError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
export interface GameCheckpoint {
  gameId: string;
  roomCode: string;
  status: GameStatus;
  round: number;
  turnUserId: number | null;
  turnSeq: number;
  turnId: number;
  lastPlayAt: number | null;
  startedAt: number;
  order: number[];
  out: number[];
  emptied: number[];
  players: {
    userId: number;
    hand: string[];
    table: string[];
    bellSuccess: number;
    bellFail: number;
    reactionSumMs: number;
  }[];
  pile: string[];
}

/** 모든 게임 상태 변경은 동기 메서드다. 시간·셔플 결과는 서버 서비스가 전달한다. */
export class Game {
  private readonly players: GamePlayer[];
  private readonly table: Table;
  private pile: Card[];
  private readonly out: number[] = [];
  /** 덱을 다 낸 순서. 아무도 낼 카드가 없을 때 마지막에 낸 사람이 이기고, 나머지는 먼저 떨어진 순으로 아래 순위다 */
  private emptied: number[] = [];
  private phase: GameStatus = GameStatus.PLAYING;
  private roundNumber = 1;
  private sequence = 0;
  private turnToken = 1;
  private revision = 1;
  private current: number | null;
  private deadline: number | null;
  private playedAt: number | null = null;
  private endedAt: number | null = null;
  private resolvedSequence = -1;
  private settlementConfirmed = false;
  private clock: number;

  private constructor(
    private readonly input: StartGameInput,
    deck: Deck,
  ) {
    const { hands, remainder } = deck.deal(input.players.length);
    this.players = input.players.map(
      (user, index) => new GamePlayer(user.userId, user.nickname, hands[index]),
    );
    this.table = new Table(this.players.map((player) => player.userId));
    this.pile = remainder;
    this.current = this.players[0].userId;
    this.deadline = input.now + TURN_TIME_MS;
    this.clock = input.now;
  }

  static create(input: StartGameInput, deck: Deck): Game {
    if (
      !input.gameId ||
      !/^\d{6}$/.test(input.roomCode) ||
      !input.roomName.trim() ||
      input.players.length < 2 ||
      input.players.length > 6 ||
      input.players.some(
        (user) => !Number.isSafeInteger(user.userId) || user.userId <= 0 || !user.nickname,
      ) ||
      new Set(input.players.map((user) => user.userId)).size !== input.players.length ||
      !Number.isSafeInteger(input.now) ||
      input.now < 0
    )
      throw new Error('Invalid game');
    return new Game({ ...input, players: input.players.map((user) => ({ ...user })) }, deck);
  }
  get id(): string {
    return this.input.gameId;
  }
  get roomCode(): string {
    return this.input.roomCode;
  }
  get status(): GameStatus {
    return this.phase;
  }
  get turnId(): number {
    return this.turnToken;
  }
  get turnSeq(): number {
    return this.sequence;
  }
  get turnDeadline(): number | null {
    return this.deadline;
  }
  get turnUserId(): number | null {
    return this.current;
  }
  get userIds(): number[] {
    return this.players.map((player) => player.userId);
  }
  get eliminatedIds(): number[] {
    return [...this.out];
  }
  /** 상태가 바뀔 때마다 오른다. 액션 없이 바뀐 경우(카드 소진 종료)도 서비스가 알아챌 수 있게 공개한다 */
  get version(): number {
    return this.revision;
  }
  has(userId: number): boolean {
    return this.players.some((player) => player.userId === userId);
  }
  canRing(userId: number, sequence: number): boolean {
    if (
      this.phase !== GameStatus.PLAYING ||
      sequence < this.sequence ||
      this.resolvedSequence === sequence
    )
      return false;
    if (sequence !== this.sequence) throw new GameRuleError(ErrorCode.VALIDATION_FAILED);
    this.activePlayer(userId);
    return true;
  }

  play(userId: number, turnId: number, now: number, automatic = false): GameAction | null {
    if (turnId < this.turnToken) return null;
    if (this.phase !== GameStatus.PLAYING) throw new GameRuleError(ErrorCode.GAME_ENDED);
    const player = this.activePlayer(userId);
    if (turnId !== this.turnToken) throw new GameRuleError(ErrorCode.VALIDATION_FAILED);
    if (userId !== this.current) throw new GameRuleError(ErrorCode.NOT_YOUR_TURN);
    now = this.time(now);
    const card = player.draw(automatic);
    this.table.play(userId, card);
    this.sequence++;
    this.playedAt = now;
    if (automatic && player.automaticTurns >= 3) this.remove(player, true);
    // 마지막 카드를 내도 바로 탈락하지 않는다. 차례에서만 빠지고 다음 종 판정까지 종을 칠 수 있다.
    else if (player.handCount === 0) this.markEmptied(userId);
    this.current = this.nextAfter(userId);
    this.newTurn(now);
    this.finishIfNeeded(now);
    this.revision++;
    return { kind: 'card', userId, card: card.face(), automatic };
  }

  ring(userId: number, sequence: number, now: number): GameAction | null {
    if (!this.canRing(userId, sequence)) return null;
    now = this.time(now);
    const player = this.activePlayer(userId);
    const totals = this.table.totals();
    const success = Object.values(totals).some((count) => count === 5);
    this.resolvedSequence = sequence;
    player.bell(success, this.playedAt === null ? 0 : now - this.playedAt);
    let movedCards: number;
    if (success) {
      const cards = [...this.table.collect(), ...this.pile];
      this.pile = [];
      player.take(cards);
      movedCards = cards.length;
      this.current = userId;
    } else {
      const penalty = player.penalty();
      // 벌칙으로 덱이 떨어진 사람은 마지막에 카드를 «낸» 사람이 아니므로 가장 앞(낮은 순위)에 둔다.
      if (penalty.length && player.handCount === 0) this.emptied.unshift(userId);
      const cards = [...penalty, ...this.table.collect()];
      this.pile.push(...cards);
      movedCards = cards.length;
    }
    this.eliminateEmpty();
    if (this.current === null || !this.canPlay(this.current))
      this.current = this.nextAfter(this.current ?? userId);
    this.roundNumber++;
    this.newTurn(now);
    this.finishIfNeeded(now);
    this.revision++;
    return { kind: 'bell', userId, success, movedCards, totals };
  }

  /**
   * 차례 시간이 끝났다. 차례인 사람이 있으면 대신 내고(005-15), 아무도 낼 카드가 없어 종 기회만 주던
   * 중이었다면 마지막으로 카드를 낸 사람을 남기고 게임을 끝낸다. 이때는 액션 없이 상태만 바뀐다.
   */
  timeout(turnId: number, now: number): GameAction | null {
    if (
      this.phase !== GameStatus.PLAYING ||
      turnId !== this.turnToken ||
      this.deadline === null ||
      now < this.deadline
    )
      return null;
    if (this.current !== null) return this.play(this.current, turnId, now, true);
    now = this.time(now);
    this.eliminateEmpty(true);
    this.finishIfNeeded(now);
    this.revision++;
    return null;
  }

  depart(userId: number, now: number): GameAction | null {
    if (this.phase !== GameStatus.PLAYING) return null;
    const player = this.players.find((entry) => entry.userId === userId);
    if (!player?.active) return null;
    now = this.time(now);
    this.remove(player, true);
    if (this.current === userId) {
      this.current = this.nextAfter(userId);
      this.newTurn(now);
    }
    this.finishIfNeeded(now);
    this.revision++;
    return { kind: 'departed', userId };
  }

  connection(userId: number, connected: boolean): GameAction | null {
    const player = this.players.find((entry) => entry.userId === userId);
    if (!player || player.connected === connected || this.phase !== GameStatus.PLAYING) return null;
    player.connection(connected);
    this.revision++;
    return { kind: 'connection', userId, connected };
  }

  settlement(): SettleGameInput {
    if (this.phase !== GameStatus.ENDED || this.endedAt === null)
      throw new GameRuleError(ErrorCode.GAME_NOT_FINISHED);
    const winner = this.players.find((player) => player.active);
    const order = [...(winner ? [winner.userId] : []), ...[...this.out].reverse()];
    return {
      gameId: this.id,
      roomCode: this.roomCode,
      roomName: this.input.roomName,
      startedAt: new Date(this.input.now).toISOString(),
      endedAt: new Date(this.endedAt).toISOString(),
      players: order.map((userId, index) => {
        const player = this.players.find((entry) => entry.userId === userId)!;
        return {
          userId,
          rank: index + 1,
          departed: player.status === GamePlayerStatus.DEPARTED,
          ...player.statistics(),
        };
      }),
    };
  }

  confirmSettlement(): void {
    if (this.phase !== GameStatus.ENDED) throw new GameRuleError(ErrorCode.GAME_NOT_FINISHED);
    if (!this.settlementConfirmed) {
      this.settlementConfirmed = true;
      this.revision++;
    }
  }

  snapshot(): GameSnapshot {
    const results =
      this.phase === GameStatus.ENDED
        ? new GameSettlement(this.settlement()).snapshot().players.map((entry) => ({
            ...entry,
            nickname: this.players.find((player) => player.userId === entry.userId)!.nickname,
          }))
        : [];
    return {
      gameId: this.id,
      roomCode: this.roomCode,
      roomName: this.input.roomName,
      status: this.phase,
      revision: this.revision,
      round: this.roundNumber,
      turnId: this.turnToken,
      turnSeq: this.sequence,
      turnUserId: this.current,
      turnDeadline: this.deadline,
      lastPlayAt: this.playedAt,
      startedAt: this.input.now,
      endedAt: this.endedAt,
      players: this.players.map((player) => ({
        userId: player.userId,
        nickname: player.nickname,
        status: player.status,
        connected: player.connected,
        handCount: player.handCount,
        tableCount: this.table.cards(player.userId).length,
        topCard: this.table.cards(player.userId)[0]?.face() ?? null,
        automaticTurns: player.automaticTurns,
      })),
      pileCount: this.pile.length,
      fruitTotals: this.table.totals(),
      results,
      settled: this.settlementConfirmed,
    };
  }

  /** 내부 Redis 미러용. 클라이언트에는 절대 보내지 않는다. */
  checkpoint(): GameCheckpoint {
    return {
      gameId: this.id,
      roomCode: this.roomCode,
      status: this.phase,
      round: this.roundNumber,
      turnUserId: this.current,
      turnSeq: this.sequence,
      turnId: this.turnToken,
      lastPlayAt: this.playedAt,
      startedAt: this.input.now,
      order: this.players.filter((player) => player.active).map((player) => player.userId),
      out: [...this.out],
      emptied: [...this.emptied],
      players: this.players.map((player) => ({
        userId: player.userId,
        hand: player.handCodes(),
        table: this.table.cards(player.userId).map((card) => card.code()),
        ...player.statistics(),
      })),
      pile: this.pile.map((card) => card.code()),
    };
  }

  private activePlayer(userId: number): GamePlayer {
    const player = this.players.find((entry) => entry.userId === userId);
    if (!player?.active) throw new GameRuleError(ErrorCode.SPECTATOR_FORBIDDEN);
    return player;
  }
  private remove(player: GamePlayer, departed: boolean, advanceRound = true): void {
    this.pile.push(...player.eliminate(departed), ...this.table.remove(player.userId));
    this.out.push(player.userId);
    this.emptied = this.emptied.filter((id) => id !== player.userId);
    if (advanceRound) this.roundNumber++;
  }
  private markEmptied(userId: number): void {
    this.emptied = [...this.emptied.filter((id) => id !== userId), userId];
  }
  /** 차례에서 카드를 낼 수 있는 사람: 게임 중이고 덱이 남은 플레이어 */
  private canPlay(userId: number): boolean {
    const player = this.players.find((entry) => entry.userId === userId);
    return !!player?.active && player.handCount > 0;
  }
  /**
   * 종 판정이 끝났거나 아무도 종을 치지 않았다. 덱이 0장인 플레이어를 덱이 떨어진 순서대로 탈락시킨다.
   * 모두 0장이면 마지막으로 카드를 낸 사람(emptied의 끝)은 남겨 1등이 되게 한다.
   */
  private eliminateEmpty(exhausted = false): void {
    const empty = this.players.filter((player) => player.active && player.handCount === 0);
    if (!empty.length) return;
    const holders = this.players.filter((player) => player.active && player.handCount > 0);
    const survivor = holders.length
      ? null
      : (this.emptied.filter((id) => empty.some((player) => player.userId === id)).at(-1) ?? null);
    const ordered = [...empty].sort(
      (a, b) => this.emptied.indexOf(a.userId) - this.emptied.indexOf(b.userId),
    );
    for (const player of ordered) if (player.userId !== survivor) this.remove(player, false, false);
    if (exhausted) this.current = null;
  }
  private nextAfter(userId: number): number | null {
    const index = this.players.findIndex((player) => player.userId === userId);
    for (let step = 1; step <= this.players.length; step++) {
      const player = this.players[(index + step) % this.players.length];
      if (player.active && player.handCount > 0) return player.userId;
    }
    return null;
  }
  private newTurn(now: number): void {
    this.turnToken++;
    this.deadline = now + TURN_TIME_MS;
  }
  private finishIfNeeded(now: number): void {
    if (this.players.filter((player) => player.active).length > 1) return;
    this.phase = GameStatus.ENDED;
    this.endedAt = now;
    this.current = null;
    this.deadline = null;
  }
  private time(now: number): number {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server time');
    this.clock = Math.max(now, this.clock);
    return this.clock;
  }
}
