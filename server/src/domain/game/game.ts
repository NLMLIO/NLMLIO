import {
  ErrorCode,
  GamePlayerStatus,
  GameStatus,
  ROUND_RESULT_MS,
  TURN_TIME_MS,
} from '@nlmlio/shared';
import type {
  BellMovePublic,
  GameAction,
  GameSnapshot,
  SettleGameInput,
  SkillChoice,
  SkillStateEvent,
} from '@nlmlio/shared';
import {
  BELL_MOVE_KEYS,
  BELL_MOVE_MS,
  BELL_MOVE_POSITIONS,
  RoomRole,
  SkillId,
  SkillTiming,
  SkillUser,
  skillById,
} from '@nlmlio/shared';
import { Card, Deck } from '../card/deck';
import { GamePlayer } from '../player/game-player';
import { SkillBook, SkillRuleError } from '../skill/skill-book';
import { pickIndex } from '../skill/skill-roll';
import type { Random } from '../skill/skill-roll';
import type { SkillParticipant } from '../skill/skill-selection';
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
  roundResumeAt: number | null;
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
  private resumeAt: number | null = null;
  private playedAt: number | null = null;
  private endedAt: number | null = null;
  private resolvedSequence = -1;
  private settlementConfirmed = false;
  private clock: number;
  private readonly skills: SkillBook;
  private readonly random: Random;
  /** 종 성공이 5의 배수가 돼 스킬 선택을 열 차례다. 결과 표시가 끝나면 서비스가 연다 */
  private skillDue = false;
  /** 스킬 선택 중 멈춘 턴의 남은 시간. 선택이 끝나면 여기서부터 이어 간다 */
  private pausedTurnMs: number | null = null;
  /** 반짝반짝한 카드를 쓴 사람. 다음에 내는 카드가 금칠이 된다 */
  private readonly sparkle = new Set<number>();
  /** 과일 6개 카드를 쓴 사람. 다음에 내는 카드가 같은 과일의 6개 특수 카드가 된다 */
  private readonly sixCard = new Set<number>();
  /** 종 옮기기: 방 전체가 새 자리·새 키로 치는 동안의 상태 */
  private bellMove: BellMovePublic | null = null;

  private constructor(
    private readonly input: StartGameInput,
    deck: Deck,
    random: Random,
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
    this.random = random;
    this.skills = new SkillBook(random);
  }

  static create(input: StartGameInput, deck: Deck, random: Random = Math.random): Game {
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
    return new Game(
      { ...input, players: input.players.map((user) => ({ ...user })) },
      deck,
      random,
    );
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
  /** 스킬 선택 중에는 턴 타이머가 멈추므로 null */
  get turnDeadline(): number | null {
    return this.skills.selection ? null : this.deadline;
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
      this.skills.selection ||
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
    // 스킬 선택 중이거나 곧 열릴 예정이면 카드 내기를 무시한다(009-01).
    if (this.skills.selection || this.skillDue) return null;
    now = this.time(now);
    if (this.resumeAt !== null && now < this.resumeAt) return null;
    this.resumeAt = null;
    let card = player.draw(automatic);
    // 과일 6개 카드: 낼 카드의 과일 그대로 6개짜리 특수 카드로 바뀐다(원래 카드는 함께 사라진다).
    if (this.sixCard.delete(userId)) card = Card.six(card.fruit);
    if (this.sparkle.delete(userId)) card.gild();
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
    const pickDue = success && this.skills.countSuccess();
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
      // 오발은 본인 카드 1장만 보관한다. 다른 플레이어의 공개 카드는 유지한다.
      this.pile.push(...penalty);
      movedCards = penalty.length;
    }
    // 판정이 났다: 테이블에 남은 과일 6개 카드는 성공·오발과 상관없이 사라진다.
    this.table.discardSpecial();
    this.eliminateEmpty();
    if (this.current === null || !this.canPlay(this.current))
      this.current = this.nextAfter(this.current ?? userId);
    this.roundNumber++;
    this.newTurn(now);
    this.resumeAt = now + ROUND_RESULT_MS;
    this.deadline = this.resumeAt + TURN_TIME_MS;
    this.finishIfNeeded(now);
    // 그 판정으로 게임이 끝나면 선택을 열지 않는다(009-01).
    if (pickDue && this.phase === GameStatus.PLAYING) this.skillDue = true;
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
      this.skills.selection ||
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
      if (this.skills.selection) this.pausedTurnMs = TURN_TIME_MS;
    }
    this.finishIfNeeded(now);
    this.revision++;
    return { kind: 'departed', userId };
  }

  /** 스킬 선택을 열 차례가 됐다면 열어야 하는 서버 시각(결과 표시가 끝나는 때). 아니면 null */
  get skillPickOpensAt(): number | null {
    return this.skillDue && this.phase === GameStatus.PLAYING
      ? (this.resumeAt ?? this.clock)
      : null;
  }
  /** 선택 중이면 마감 시각, 아니면 null */
  get skillPickDeadline(): number | null {
    return this.skills.selection?.deadline ?? null;
  }
  get skillPicking(): boolean {
    return this.skills.selection !== null;
  }

  /**
   * 스킬 선택을 연다. 플레이 중인 사람은 플레이어로, `spectatorIds`(방의 관전자, 방금 탈락한 사람 포함)는 관전자로
   * 후보를 받는다. 열면 카드 내기·종·턴 타이머가 멈춘다. 아직 열 때가 아니면 false.
   */
  openSkillPick(spectatorIds: readonly number[], now: number): boolean {
    if (!this.skillDue || this.phase !== GameStatus.PLAYING || this.skills.selection) return false;
    now = this.time(now);
    if (this.resumeAt !== null && now < this.resumeAt) return false;
    this.skillDue = false;
    const active = this.players.filter((player) => player.active).map((player) => player.userId);
    const participants: SkillParticipant[] = [
      ...active.map((userId) => ({ userId, role: RoomRole.PLAYER })),
      ...[...new Set(spectatorIds)]
        .filter((userId) => !active.includes(userId))
        .map((userId) => ({ userId, role: RoomRole.SPECTATOR })),
    ];
    if (!this.skills.open(participants, now)) return false;
    this.pausedTurnMs = this.deadline === null ? null : Math.max(0, this.deadline - now);
    this.revision++;
    return true;
  }

  /** 후보 칸 선택(FUNC-009-03). 늦었거나 이미 골랐으면 조용히 무시하고 false */
  chooseSkill(userId: number, choice: SkillChoice, now: number): boolean {
    const selection = this.skills.selection;
    if (!selection) return false;
    now = this.time(now);
    const had = selection.hasChosen(userId);
    try {
      this.skills.choose(userId, choice, now);
    } catch (error) {
      if (error instanceof SkillRuleError) throw new GameRuleError(error.code);
      throw error;
    }
    if (had || !selection.hasChosen(userId)) return false;
    if (!this.skills.selection) this.resumeAfterSkillPick(now);
    this.revision++;
    return true;
  }

  /** 마감이 지났으면 못 고른 사람을 처리하고 선택을 끝낸 뒤 게임을 다시 진행한다. 끝났으면 true */
  settleSkillPick(now: number): boolean {
    now = this.time(now);
    if (!this.skills.settle(now)) return false;
    this.resumeAfterSkillPick(now);
    this.revision++;
    return true;
  }

  /** 게임을 떠난 사람의 스킬을 지우고 진행 중인 선택 대상에서 뺀다. 상태가 바뀌었으면 true */
  releaseSkills(userId: number, now: number): boolean {
    const before = this.skills.selection;
    this.skills.drop(userId);
    if (!before) return false;
    if (!this.skills.selection) this.resumeAfterSkillPick(this.time(now));
    this.revision++;
    return true;
  }

  /**
   * 스킬 사용(FUNC-009-04). 보유 칸 `slot`의 스킬을 쓰고 사라지게 한 뒤 사용 알림 액션을 돌려준다.
   * 스킬 선택 중이면 조용히 무시(null). 쓸 수 없는 스킬·시점·역할은 `SKILL_UNAVAILABLE`,
   * 칸 번호·대상이 잘못되면 `VALIDATION_FAILED`다. 플레이 중인 사람은 플레이어로, 아니면 관전자로 본다.
   */
  useSkill(
    userId: number,
    slot: number,
    targetUserId: number | undefined,
    now: number,
  ): GameAction | null {
    if (this.phase !== GameStatus.PLAYING) throw new GameRuleError(ErrorCode.GAME_ENDED);
    if (this.skills.selection) return null;
    if (!Number.isInteger(slot) || slot < 0) throw new GameRuleError(ErrorCode.VALIDATION_FAILED);
    const skillId = this.skills.inventory(userId).list()[slot];
    if (!skillId) throw new GameRuleError(ErrorCode.SKILL_UNAVAILABLE);
    const skill = skillById(skillId);
    const role = this.activePlayerOrNull(userId) ? RoomRole.PLAYER : RoomRole.SPECTATOR;
    const allowed =
      skill.user === SkillUser.BOTH ||
      skill.user === (role === RoomRole.PLAYER ? SkillUser.PLAYER : SkillUser.SPECTATOR);
    // 아직 구현하지 않은 효과, 사용자 역할이 안 맞는 스킬, 사용 시점이 아닌 스킬은 쓸 수 없다.
    if (!skill.available || !allowed || skill.timing !== SkillTiming.ANYTIME)
      throw new GameRuleError(ErrorCode.SKILL_UNAVAILABLE);
    if (skill.target === 'one') {
      if (
        targetUserId === undefined ||
        targetUserId === userId ||
        !this.activePlayerOrNull(targetUserId)
      )
        throw new GameRuleError(ErrorCode.VALIDATION_FAILED);
    } else if (targetUserId !== undefined) throw new GameRuleError(ErrorCode.VALIDATION_FAILED);
    const at = this.time(now);
    this.skills.consume(userId, slot);
    this.applySkill(skillId, userId, at);
    this.revision++;
    return { kind: 'skill', userId, skillId, targetUserId: targetUserId ?? null };
  }

  /** 본인에게만 보내는 스킬 상태: 보유 스킬과(선택 중이면) 후보·내 선택 */
  skillState(userId: number): SkillStateEvent {
    const selection = this.skills.selection;
    const role = selection?.roleOf(userId);
    const outcome = selection?.outcome(userId) ?? null;
    return {
      gameId: this.id,
      slots: this.skills.inventory(userId).list(),
      pick:
        selection && role
          ? {
              role,
              candidates: selection.candidates(userId),
              candidate: outcome?.candidate ?? null,
              slot: outcome?.slot ?? null,
              declined: outcome?.declined ?? false,
            }
          : null,
    };
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
      turnDeadline: this.turnDeadline,
      roundResumeAt: this.resumeAt,
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
      skillSuccesses: this.skills.successCount,
      bellMove: this.bellMove,
      skillPick: this.skills.selection
        ? {
            deadline: this.skills.selection.deadline,
            successCount: this.skills.successCount,
            pickNo: this.skills.pickNo,
            total: this.skills.selection.userIds.length,
            done: this.skills.selection.userIds.length - this.skills.selection.pending().length,
          }
        : null,
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
      roundResumeAt: this.resumeAt,
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

  private activePlayerOrNull(userId: number): GamePlayer | null {
    const player = this.players.find((entry) => entry.userId === userId);
    return player?.active ? player : null;
  }
  /** 스킬 효과. `available`이 true인 스킬만 여기까지 온다 */
  private applySkill(skillId: SkillId, userId: number, now: number): void {
    switch (skillId) {
      case SkillId.SPARKLE_CARD:
        this.sparkle.add(userId);
        break;
      case SkillId.SIX_FRUIT_CARD:
        this.sixCard.add(userId);
        break;
      case SkillId.BELL_MOVE:
        // 모두 같은 자리·같은 키. 다시 쓰면 새로 정해 시간을 다시 센다.
        this.bellMove = {
          position: pickIndex(this.random, BELL_MOVE_POSITIONS),
          key: BELL_MOVE_KEYS[pickIndex(this.random, BELL_MOVE_KEYS.length)],
          endsAt: now + BELL_MOVE_MS,
        };
        break;
      default:
        throw new Error(`Skill effect not implemented: ${skillId}`);
    }
  }
  private activePlayer(userId: number): GamePlayer {
    const player = this.players.find((entry) => entry.userId === userId);
    if (!player?.active) throw new GameRuleError(ErrorCode.SPECTATOR_FORBIDDEN);
    return player;
  }
  private remove(player: GamePlayer, departed: boolean, advanceRound = true): void {
    this.pile.push(...player.eliminate(departed), ...this.table.remove(player.userId));
    this.out.push(player.userId);
    this.skills.clear(player.userId);
    this.sparkle.delete(player.userId);
    this.sixCard.delete(player.userId);
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
    this.deadline = Math.max(now, this.resumeAt ?? now) + TURN_TIME_MS;
  }
  private finishIfNeeded(now: number): void {
    if (this.players.filter((player) => player.active).length > 1) return;
    this.phase = GameStatus.ENDED;
    this.skills.cancelSelection();
    this.bellMove = null;
    this.skillDue = false;
    this.pausedTurnMs = null;
    this.endedAt = now;
    this.current = null;
    this.deadline = null;
    this.resumeAt = null;
  }
  private resumeAfterSkillPick(now: number): void {
    if (this.pausedTurnMs === null) return;
    this.deadline = now + this.pausedTurnMs;
    this.pausedTurnMs = null;
  }
  private time(now: number): number {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server time');
    this.clock = Math.max(now, this.clock);
    return this.clock;
  }
}
