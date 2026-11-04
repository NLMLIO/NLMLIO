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
    else if (player.handCount === 0) this.remove(player, false);
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
      const cards = [...player.penalty(), ...this.table.collect()];
      this.pile.push(...cards);
      movedCards = cards.length;
      if (player.handCount === 0) {
        this.remove(player, false, false);
        if (this.current === userId) this.current = this.nextAfter(userId);
      }
    }
    this.roundNumber++;
    this.newTurn(now);
    this.finishIfNeeded(now);
    this.revision++;
    return { kind: 'bell', userId, success, movedCards, totals };
  }

  timeout(turnId: number, now: number): GameAction | null {
    if (
      this.phase !== GameStatus.PLAYING ||
      turnId !== this.turnToken ||
      this.deadline === null ||
      now < this.deadline ||
      this.current === null
    )
      return null;
    return this.play(this.current, turnId, now, true);
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
    if (advanceRound) this.roundNumber++;
  }
  private nextAfter(userId: number): number | null {
    const index = this.players.findIndex((player) => player.userId === userId);
    for (let step = 1; step <= this.players.length; step++) {
      const player = this.players[(index + step) % this.players.length];
      if (player.active) return player.userId;
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
