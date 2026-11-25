import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  GAME_RECONNECT_GRACE_MS,
  GamePlayerStatus,
  GameStatus,
  RoomRole,
  RoomStatus,
} from '@nlmlio/shared';
import type {
  BellRingRequest,
  CardPlayRequest,
  GameAction,
  GameSnapshot,
  SkillPickRequest,
  SkillStateEvent,
  SkillUseRequest,
} from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import { GameRuleError } from '../../domain/game/game';
import type { Game } from '../../domain/game/game';
import { GameStore } from '../../infra/game-state/game.store';
import type { GameSession } from '../../infra/game-state/game.store';
import { RoomQueue } from '../../infra/game-state/room-queue';
import { GameStateRepository } from '../../infra/redis/game-state.repository';
import { RoomGameLifecycle } from '../room/room-game.lifecycle';
import { RoomService } from '../room/room.service';
import { GameEvents } from './game.events';
import { GameFactory } from './game.factory';
import { GameResultService } from './game-result.service';
import { GameTimers } from './game-timers';

type Authorize = () => Promise<void>;
const trusted: Authorize = async () => {};

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  private readonly connections = new Map<number, Set<string>>();
  constructor(
    private readonly rooms: RoomService,
    private readonly lifecycle: RoomGameLifecycle,
    private readonly games: GameStore,
    private readonly queue: RoomQueue,
    private readonly factory: GameFactory,
    private readonly snapshots: GameStateRepository,
    private readonly results: GameResultService,
    private readonly events: GameEvents,
    private readonly timers: GameTimers,
  ) {}

  onModuleInit(): void {
    this.lifecycle.register({
      start: (id) => this.start(id),
      leaving: (id, remove) => this.leaving(id, remove),
      closed: (code) => this.closed(code),
      renamed: async (id, nickname) => {
        const room = this.rooms.memberRoom(id);
        if (!room) return;
        await this.queue.run(room.code, async () => {
          const session = this.games.get(room.code);
          if (session?.game.rename(id, nickname)) await this.changed(session);
        });
      },
      joined: (id) => {
        const state = this.sync(id);
        if (state?.status === GameStatus.PLAYING) {
          this.events.sync(id, state);
          this.events.skills(id, this.skillsFor(id));
        }
        if (state && !this.connections.get(id)?.size)
          this.scheduleWaitingDisconnect(id, state.roomCode);
      },
    });
  }

  start(userId: number, authorize: Authorize = trusted): Promise<void> {
    const code = this.requireRoomCode(userId);
    return this.queue.run(code, async () => {
      await authorize();
      const room = this.rooms.memberRoom(userId);
      if (!room || room.code !== code) throw appError(ErrorCode.NOT_IN_ROOM);
      const previous = this.games.get(code);
      if (previous?.game.status === GameStatus.PLAYING) throw appError(ErrorCode.ROOM_IN_GAME);
      if (previous && (!previous.settled || !previous.cleared))
        throw appError(ErrorCode.GAME_RESULT_PENDING);
      // 방 규칙은 Room 도메인이 검증한다. start 상태를 만든 뒤 await 없이 엔진까지 조립한다.
      const started = this.rooms.beginGame(userId);
      let game: Game;
      try {
        game = this.factory.create({
          gameId: randomUUID(),
          roomCode: code,
          roomName: started.name,
          players: started.members.filter((member) => member.role === RoomRole.PLAYER),
          now: Date.now(),
        });
      } catch (error) {
        this.rooms.finishGame(code);
        throw error;
      }
      const session = this.games.set(game);
      for (const id of game.userIds) {
        this.timers.cancel(`connection:${id}`);
        if (!this.connections.get(id)?.size) {
          game.connection(id, false);
          this.scheduleDisconnect(id, code, game.id);
        }
      }
      await this.changed(session);
    });
  }

  play(
    userId: number,
    input: CardPlayRequest,
    receivedAt = Date.now(),
    authorize: Authorize = trusted,
  ): Promise<boolean> {
    return this.command(userId, input.gameId, authorize, (game) =>
      game.play(userId, input.turnId, receivedAt),
    );
  }

  bell(
    userId: number,
    input: BellRingRequest,
    receivedAt = Date.now(),
    authorize: Authorize = trusted,
  ): Promise<boolean> {
    return this.command(userId, input.gameId, authorize, async (game) => {
      // 승자는 이미 확정돼도 판정 결과를 보여 주는 동안 늦게 도착한 손도 서버 접수 순서로 함께 표시한다.
      if (game.recordBellHand(userId, input.turnSeq, receivedAt)) return null;
      if (!game.canRing(userId, input.turnSeq, receivedAt)) return null;
      if (!(await this.snapshots.claimBell(game.id, input.turnSeq, userId))) return null;
      return game.ring(userId, input.turnSeq, receivedAt, input.bell);
    });
  }

  /** 무시된 종 요청이 이미 지난 테이블에 대한 늦은 요청인가(읽기 전용) */
  isLateBell(userId: number, input: BellRingRequest, now = Date.now()): boolean {
    const room = this.rooms.memberRoom(userId);
    const session = room ? this.games.get(room.code) : undefined;
    return (
      session?.game.id === input.gameId &&
      session.game.status === GameStatus.PLAYING &&
      session.game.isLateBell(input.turnSeq, now)
    );
  }

  sync(userId: number): GameSnapshot | null {
    const room = this.rooms.memberRoom(userId);
    const session = room ? this.games.get(room.code) : undefined;
    return session?.game.snapshot() ?? null;
  }

  /** 스킬 후보 선택(FUNC-009-03). 늦었거나 이미 고른 요청은 조용히 무시하고 false */
  pickSkill(
    userId: number,
    input: SkillPickRequest,
    receivedAt = Date.now(),
    authorize: Authorize = trusted,
  ): Promise<boolean> {
    const code = this.requireRoomCode(userId);
    return this.queue.run(code, async () => {
      await authorize();
      if (this.requireRoomCode(userId) !== code) throw appError(ErrorCode.NOT_IN_ROOM);
      const session = this.games.get(code);
      if (!session || session.game.id !== input.gameId) throw appError(ErrorCode.GAME_NOT_FOUND);
      let accepted: boolean;
      try {
        accepted = session.game.chooseSkill(userId, input.choice, receivedAt);
      } catch (error) {
        if (error instanceof GameRuleError) throw appError(error.code);
        throw error;
      }
      if (accepted) await this.changed(session);
      return accepted;
    });
  }

  /**
   * 스킬 사용(FUNC-009-04). 쓰면 칸에서 사라지고 스킬 공개 범위에 따라 사용 알림(`game:action`)이 간다.
   * 스킬 선택 중이면 조용히 무시하고 false, 쓸 수 없으면 `SKILL_UNAVAILABLE`.
   */
  useSkill(
    userId: number,
    input: SkillUseRequest,
    receivedAt = Date.now(),
    authorize: Authorize = trusted,
  ): Promise<boolean> {
    return this.command(userId, input.gameId, authorize, (game) =>
      game.useSkill(userId, input.slot, input.targetUserId, receivedAt, input.expectedSkillId),
    );
  }

  /** 본인의 스킬 상태. 진행 중인 게임이 없으면 null */
  skillsFor(userId: number): SkillStateEvent | null {
    const room = this.rooms.memberRoom(userId);
    const session = room ? this.games.get(room.code) : undefined;
    return session?.game.status === GameStatus.PLAYING ? session.game.skillState(userId) : null;
  }

  async returnToRoom(userId: number, authorize: Authorize = trusted): Promise<void> {
    const code = this.requireRoomCode(userId);
    await this.queue.run(code, async () => {
      await authorize();
      if (this.requireRoomCode(userId) !== code) throw appError(ErrorCode.NOT_IN_ROOM);
      const session = this.games.get(code);
      if (!session) throw appError(ErrorCode.GAME_NOT_FOUND);
      if (session.game.status !== GameStatus.ENDED) throw appError(ErrorCode.GAME_NOT_FINISHED);
      if (!session.settled) await this.persist(session);
      if (!session.settled) throw appError(ErrorCode.GAME_RESULT_PENDING);
    });
  }

  async connected(userId: number, socketId: string): Promise<void> {
    const sockets = this.connections.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.connections.set(userId, sockets);
    this.timers.cancel(`connection:${userId}`);
    const room = this.rooms.memberRoom(userId);
    if (!room) return;
    await this.queue.run(room.code, async () => {
      const session = this.games.get(room.code);
      const action = session?.game.connection(userId, true);
      if (session && action) await this.changed(session, action);
    });
  }

  async disconnected(userId: number, socketId: string): Promise<void> {
    const sockets = this.connections.get(userId);
    sockets?.delete(socketId);
    if (sockets?.size) return;
    this.connections.delete(userId);
    const room = this.rooms.memberRoom(userId);
    if (!room) return;
    const session = this.games.get(room.code);
    if (
      session?.game.status === GameStatus.PLAYING &&
      session.game
        .snapshot()
        .players.some(
          (player) => player.userId === userId && player.status === GamePlayerStatus.ACTIVE,
        )
    ) {
      this.scheduleDisconnect(userId, room.code, session.game.id);
      await this.queue.run(room.code, async () => {
        const action = session.game.connection(userId, false);
        if (action) await this.changed(session, action);
      });
    } else {
      this.scheduleWaitingDisconnect(userId, room.code);
    }
  }

  private async command(
    userId: number,
    gameId: string,
    authorize: Authorize,
    action: (game: Game) => GameAction | null | Promise<GameAction | null>,
  ): Promise<boolean> {
    const code = this.requireRoomCode(userId);
    return this.queue.run(code, async () => {
      await authorize();
      if (this.requireRoomCode(userId) !== code) throw appError(ErrorCode.NOT_IN_ROOM);
      const session = this.games.get(code);
      if (!session || session.game.id !== gameId) throw appError(ErrorCode.GAME_NOT_FOUND);
      let event: GameAction | null;
      const version = session.game.version;
      try {
        event = await action(session.game);
      } catch (error) {
        if (session.game.version !== version) await this.changed(session);
        if (error instanceof GameRuleError) throw appError(error.code);
        throw error;
      }
      if (event || session.game.version !== version)
        await this.changed(session, event ?? undefined);
      return event !== null;
    });
  }

  private async leaving(userId: number, remove: () => Promise<void>): Promise<void> {
    const code = this.requireRoomCode(userId);
    this.timers.cancel(`connection:${userId}`);
    await this.queue.run(code, async () => {
      const session = this.games.get(code);
      const action = session?.game.depart(userId, Date.now());
      // 게임을 떠나는 사람의 스킬을 지우고 진행 중인 선택 대상에서 뺀다.
      const released = session?.game.releaseSkills(userId, Date.now()) ?? false;
      session?.skillSent.delete(userId);
      if (session && (action || released)) await this.changed(session, action ?? undefined);
      await remove();
    });
  }

  private closed(code: string): void {
    this.timers.cancel(`turn:${code}`);
    this.timers.cancel(`skill-open:${code}`);
    this.timers.cancel(`skill-settle:${code}`);
    this.timers.cancel(`rat:${code}`);
    const session = this.games.get(code);
    if (!session) return;
    session.closed = true;
    // 결과 저장 실패 중 마지막 사람이 나가도 정산 재시도는 유지한다.
    if (session.settled && session.cleared) {
      this.games.delete(code);
      this.timers.cancel(`retry:${code}`);
    }
  }

  private async changed(session: GameSession, action?: GameAction): Promise<void> {
    const game = session.game;
    // 안해로 게임이 다시 시작돼 되살아난 탈락자는 방에서도 참가자로 돌린다(이탈한 사람은 그대로다).
    for (const id of session.marked) {
      if (game.eliminatedIds.includes(id)) continue;
      session.marked.delete(id);
      this.timers.cancel(`connection:${id}`);
      if (this.rooms.memberRoom(id)?.code === game.roomCode) this.rooms.markPlayer(id);
      if (!this.connections.get(id)?.size) {
        game.connection(id, false);
        this.scheduleDisconnect(id, game.roomCode, game.id);
      }
    }
    for (const id of game.eliminatedIds) {
      if (!session.marked.has(id)) {
        this.timers.cancel(`connection:${id}`);
        if (!this.connections.get(id)?.size && this.rooms.memberRoom(id)?.code === game.roomCode)
          this.scheduleWaitingDisconnect(id, game.roomCode);
        if (this.rooms.memberRoom(id)?.code === game.roomCode) this.rooms.markSpectator(id);
        session.marked.add(id);
      }
    }
    if (game.status === GameStatus.ENDED) {
      this.timers.cancel(`turn:${game.roomCode}`);
      this.timers.cancel(`skill-open:${game.roomCode}`);
      this.timers.cancel(`skill-settle:${game.roomCode}`);
      this.timers.cancel(`rat:${game.roomCode}`);
      for (const id of game.userIds) {
        this.timers.cancel(`connection:${id}`);
        if (!this.connections.get(id)?.size) this.scheduleWaitingDisconnect(id, game.roomCode);
      }
      if (!session.returnedToRoom) {
        this.rooms.finishGame(game.roomCode);
        session.returnedToRoom = true;
      }
    } else {
      const opensAt = game.skillPickOpensAt;
      const now = Date.now();
      if (opensAt !== null && now >= opensAt) game.openSkillPick(this.spectatorIds(session), now);
      this.scheduleTurn(session);
      this.scheduleSkillPick(session);
      this.scheduleRat(session);
    }
    const state = game.snapshot();
    if (action)
      this.events.action(game.roomCode, { ...action, gameId: game.id, revision: state.revision });
    this.events.state(state);
    this.pushSkills(session);
    await this.persist(session);
  }

  private async persist(session: GameSession): Promise<void> {
    const game = session.game;
    let failed = false;
    if (!session.settled) {
      try {
        await this.snapshots.save(game.checkpoint());
      } catch {
        failed = true;
        this.logger.warn('Game Redis snapshot pending');
      }
      if (game.status === GameStatus.ENDED) {
        try {
          await this.results.settle(game.settlement());
          session.settled = true;
          game.confirmSettlement();
        } catch {
          failed = true;
          this.logger.warn('Game settlement pending');
        }
      }
    }
    if (session.settled && !session.cleared) {
      try {
        await this.snapshots.clear(game.id);
        session.cleared = true;
      } catch {
        failed = true;
        this.logger.warn('Game Redis cleanup pending');
      }
    }
    if (failed) {
      this.timers.schedule(`retry:${game.roomCode}`, Date.now() + 1000, () => {
        this.background(() => this.queue.run(game.roomCode, () => this.persist(session)));
      });
    } else this.timers.cancel(`retry:${game.roomCode}`);
    if (game.status === GameStatus.ENDED) this.events.state(game.snapshot());
    if (
      session.closed &&
      session.settled &&
      session.cleared &&
      this.games.get(game.roomCode) === session
    )
      this.games.delete(game.roomCode);
  }

  private scheduleRat(session: GameSession): void {
    const { game } = session;
    const key = `rat:${game.roomCode}`;
    const deadline = game.ratDeadline;
    if (deadline === null) {
      this.timers.cancel(key);
      return;
    }
    this.timers.schedule(key, deadline, () => {
      this.background(() =>
        this.queue.run(game.roomCode, async () => {
          if (this.games.get(game.roomCode) === session && game.settleRat(Date.now()))
            await this.changed(session);
        }),
      );
    });
  }

  private scheduleTurn(session: GameSession): void {
    const { game } = session;
    const turnId = game.turnId;
    const deadline = game.turnDeadline;
    // 스킬 선택 중에는 턴 타이머가 멈춘다. 선택이 끝나면 changed가 다시 건다.
    if (deadline === null) {
      this.timers.cancel(`turn:${game.roomCode}`);
      return;
    }
    this.timers.schedule(`turn:${game.roomCode}`, deadline, () => {
      this.background(() =>
        this.queue.run(game.roomCode, async () => {
          if (this.games.get(game.roomCode) !== session) return;
          const version = game.version;
          const action = game.timeout(turnId, Date.now());
          // 아무도 낼 카드가 없어 끝난 경우는 액션 없이 상태만 바뀐다.
          if (action || game.version !== version) await this.changed(session, action ?? undefined);
        }),
      );
    });
  }
  /**
   * 세 라운드마다 결과 표시가 끝나면 스킬 선택을 열고, 열린 뒤에는 10초 마감에 처리한다(FUNC-009-01·003).
   * 둘 다 같은 방 큐에 넣어 다른 이벤트와 순서대로 처리한다.
   */
  private scheduleSkillPick(session: GameSession): void {
    const { game } = session;
    const code = game.roomCode;
    const opensAt = game.skillPickOpensAt;
    if (opensAt === null) this.timers.cancel(`skill-open:${code}`);
    else
      this.timers.schedule(`skill-open:${code}`, opensAt, () => {
        this.background(() =>
          this.queue.run(code, async () => {
            if (this.games.get(code) !== session) return;
            if (game.openSkillPick(this.spectatorIds(session), Math.max(Date.now(), opensAt)))
              await this.changed(session);
          }),
        );
      });
    const deadline = game.skillPickDeadline;
    if (deadline === null) this.timers.cancel(`skill-settle:${code}`);
    else
      this.timers.schedule(`skill-settle:${code}`, deadline, () => {
        this.background(() =>
          this.queue.run(code, async () => {
            if (this.games.get(code) !== session) return;
            if (game.settleSkillPick(Math.max(Date.now(), deadline))) await this.changed(session);
          }),
        );
      });
  }
  /** 방 안의 관전자(탈락·이탈해 관전 중인 사람, 도중에 들어온 관전자 포함) */
  private spectatorIds(session: GameSession): number[] {
    const room = this.roomOf(session);
    return (room?.members ?? [])
      .filter((member) => member.role === RoomRole.SPECTATOR)
      .map((member) => member.userId);
  }
  private roomOf(session: GameSession) {
    for (const id of session.game.userIds) {
      const room = this.rooms.memberRoom(id);
      if (room) return room;
    }
    return null;
  }
  /** 방 사람 모두에게, 스킬 상태가 바뀐 사람만 골라 본인에게 보낸다 */
  private pushSkills(session: GameSession): void {
    const room = this.roomOf(session);
    if (!room) return;
    for (const { userId } of room.members) {
      const state = session.game.skillState(userId);
      const signature = JSON.stringify(state);
      if (session.skillSent.get(userId) === signature) continue;
      session.skillSent.set(userId, signature);
      this.events.skills(userId, state);
    }
  }
  private scheduleDisconnect(userId: number, code: string, gameId: string): void {
    this.timers.schedule(`connection:${userId}`, Date.now() + GAME_RECONNECT_GRACE_MS, () => {
      this.background(() =>
        this.queue.run(code, async () => {
          if (this.connections.get(userId)?.size) return;
          const session = this.games.get(code);
          if (!session || session.game.id !== gameId) return;
          const action = session.game.depart(userId, Date.now());
          if (action) await this.changed(session, action);
        }),
      );
    });
  }
  private scheduleWaitingDisconnect(userId: number, code: string): void {
    this.timers.schedule(`connection:${userId}`, Date.now() + 60_000, () => {
      if (this.connections.get(userId)?.size || this.rooms.memberRoom(userId)?.code !== code)
        return;
      const session = this.games.get(code);
      if (
        this.rooms.memberRoom(userId)?.status === RoomStatus.PLAYING &&
        session?.game
          .snapshot()
          .players.some(
            (player) => player.userId === userId && player.status === GamePlayerStatus.ACTIVE,
          )
      )
        return;
      this.background(() => this.rooms.leaveMember(userId));
    });
  }
  private requireRoomCode(userId: number): string {
    const room = this.rooms.memberRoom(userId);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    return room.code;
  }
  private background(action: () => Promise<void>): void {
    void action().catch((error: unknown) =>
      this.logger.error(error instanceof Error ? error.name : 'Game background error'),
    );
  }
}
