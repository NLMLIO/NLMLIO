import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  GAME_RECONNECT_GRACE_MS,
  GameStatus,
  RoomRole,
  RoomStatus,
} from '@nlmlio/shared';
import type { BellRingRequest, CardPlayRequest, GameAction, GameSnapshot } from '@nlmlio/shared';
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
      if (!game.canRing(userId, input.turnSeq)) return null;
      if (!(await this.snapshots.claimBell(game.id, input.turnSeq, userId))) return null;
      return game.ring(userId, input.turnSeq, receivedAt);
    });
  }

  sync(userId: number): GameSnapshot | null {
    const room = this.rooms.memberRoom(userId);
    const session = room ? this.games.get(room.code) : undefined;
    return session?.game.snapshot() ?? null;
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
    if (session?.game.status === GameStatus.PLAYING) {
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
      try {
        event = await action(session.game);
      } catch (error) {
        if (error instanceof GameRuleError) throw appError(error.code);
        throw error;
      }
      if (event) await this.changed(session, event);
      return event !== null;
    });
  }

  private async leaving(userId: number, remove: () => Promise<void>): Promise<void> {
    const code = this.requireRoomCode(userId);
    this.timers.cancel(`connection:${userId}`);
    await this.queue.run(code, async () => {
      const session = this.games.get(code);
      const action = session?.game.depart(userId, Date.now());
      if (session && action) await this.changed(session, action);
      await remove();
    });
  }

  private closed(code: string): void {
    this.timers.cancel(`turn:${code}`);
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
    for (const id of game.eliminatedIds) {
      this.timers.cancel(`connection:${id}`);
      if (!session.marked.has(id)) {
        if (this.rooms.memberRoom(id)?.code === game.roomCode) this.rooms.markSpectator(id);
        session.marked.add(id);
      }
    }
    if (game.status === GameStatus.ENDED) {
      this.timers.cancel(`turn:${game.roomCode}`);
      for (const id of game.userIds) {
        this.timers.cancel(`connection:${id}`);
        if (!this.connections.get(id)?.size) this.scheduleWaitingDisconnect(id, game.roomCode);
      }
      if (!session.returnedToRoom) {
        this.rooms.finishGame(game.roomCode);
        session.returnedToRoom = true;
      }
    } else this.scheduleTurn(session);
    const state = game.snapshot();
    if (action)
      this.events.action(game.roomCode, { ...action, gameId: game.id, revision: state.revision });
    this.events.state(state);
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

  private scheduleTurn(session: GameSession): void {
    const { game } = session;
    const turnId = game.turnId;
    this.timers.schedule(`turn:${game.roomCode}`, game.turnDeadline!, () => {
      this.background(() =>
        this.queue.run(game.roomCode, async () => {
          if (this.games.get(game.roomCode) !== session) return;
          const action = game.timeout(turnId, Date.now());
          if (action) await this.changed(session, action);
        }),
      );
    });
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
      if (this.rooms.memberRoom(userId)?.status === RoomStatus.PLAYING && session?.game.has(userId))
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
