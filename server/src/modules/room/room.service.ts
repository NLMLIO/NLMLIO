import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode, RoomStatus } from '@nlmlio/shared';
import type {
  CreateRoomRequest,
  CurrentRoomResponse,
  RoomResponse,
  RoomRole,
} from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import type { UserAccount } from '../../domain/user/account';
import { Room, RoomRuleError } from '../../domain/room/room';
import { RoomStore } from '../../infra/game-state/room.store';
import { RoomCodeRegistry } from '../../infra/redis/room-code.registry';
import { RoomEvents } from './room.events';
import { RoomGameLifecycle } from './room-game.lifecycle';

const MAX_CODE_ATTEMPTS = 20;

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomStore,
    private readonly codes: RoomCodeRegistry,
    private readonly events: RoomEvents,
    private readonly game: RoomGameLifecycle,
  ) {}

  async create(account: UserAccount, input: CreateRoomRequest): Promise<RoomResponse> {
    if (this.rooms.findByMember(account.id)) throw appError(ErrorCode.ALREADY_IN_ROOM);
    const code = await this.reserveCode();
    // 코드를 예약하는 동안 같은 회원의 다른 요청이 먼저 방을 만들었을 수 있다.
    if (this.rooms.findByMember(account.id)) {
      await this.codes.release(code);
      throw appError(ErrorCode.ALREADY_IN_ROOM);
    }
    const room = Room.create({
      code,
      name: input.roomName,
      host: { userId: account.id, nickname: account.nickname },
    });
    this.rooms.add(room, account.id);
    this.events.subscribe(account.id, code);
    this.events.state(room);
    return room.snapshot();
  }

  join(account: UserAccount, code: string): RoomResponse {
    if (this.rooms.findByMember(account.id)) throw appError(ErrorCode.ALREADY_IN_ROOM);
    const room = this.rooms.findByCode(code);
    if (!room) throw appError(ErrorCode.ROOM_NOT_FOUND);
    this.rule(() => room.join({ userId: account.id, nickname: account.nickname }));
    this.rooms.addMember(room, account.id);
    this.events.subscribe(account.id, code);
    this.events.notice(code, { type: 'joined', nickname: account.nickname });
    this.events.state(room);
    return room.snapshot();
  }

  current(account: UserAccount): CurrentRoomResponse {
    return { room: this.memberRoom(account.id) };
  }

  /** 다른 모듈이 방 소속을 확인할 때 사용하는 서버의 단일 진실이다. */
  memberRoom(userId: number): RoomResponse | null {
    return this.rooms.findByMember(userId)?.snapshot() ?? null;
  }

  /** 게임에서 탈락한 회원을 방에 남겨 관전·채팅 권한을 유지한다. */
  markSpectator(userId: number): void {
    const room = this.requireRoom(userId);
    room.markSpectator(userId);
    this.events.state(room);
  }

  async leave(account: UserAccount): Promise<void> {
    await this.leaveMember(account.id);
  }

  async leaveMember(userId: number): Promise<void> {
    const room = this.requireRoom(userId);
    const remove = async () => {
      if (!room.has(userId)) return;
      const nickname = room.nicknameOf(userId);
      const host = room.host;
      room.leave(userId);
      await this.removed(room, userId);
      if (room.isEmpty) return;
      this.events.notice(room.code, { type: 'left', nickname });
      this.announceHost(room, host);
      this.events.state(room);
    };
    // 게임 이탈 판정과 실제 방 제거를 하나의 게임 큐 작업으로 마친다.
    if (room.snapshot().status === RoomStatus.PLAYING) await this.game.leaving(userId, remove);
    else await remove();
  }

  move(actorId: number, targetId: number, role: RoomRole): void {
    const room = this.requireRoom(actorId);
    if (!this.rule(() => room.move(actorId, targetId, role))) return;
    this.events.notice(room.code, { type: 'moved', nickname: room.nicknameOf(targetId), role });
    this.events.state(room);
  }

  async kick(actorId: number, targetId: number): Promise<void> {
    const room = this.requireRoom(actorId);
    const nickname = this.rule(() => room.nicknameOf(targetId));
    this.rule(() => room.kick(actorId, targetId));
    await this.removed(room, targetId);
    this.events.kicked(targetId);
    this.events.notice(room.code, { type: 'kicked', nickname });
    this.events.state(room);
  }

  delegate(actorId: number, targetId: number): void {
    const room = this.requireRoom(actorId);
    this.rule(() => room.delegate(actorId, targetId));
    this.announceHost(room, actorId);
    this.events.state(room);
  }

  async start(actorId: number): Promise<void> {
    await this.game.start(actorId);
  }

  beginGame(actorId: number): RoomResponse {
    const room = this.requireRoom(actorId);
    this.rule(() => room.start(actorId));
    this.events.notice(room.code, { type: 'started' });
    this.events.state(room);
    return room.snapshot();
  }

  finishGame(code: string): void {
    const room = this.rooms.findByCode(code);
    if (!room) return;
    const host = room.host;
    room.finish();
    this.announceHost(room, host);
    this.events.state(room);
  }

  private requireRoom(userId: number): Room {
    const room = this.rooms.findByMember(userId);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    return room;
  }

  private async removed(room: Room, userId: number): Promise<void> {
    this.rooms.removeMember(room, userId);
    this.events.unsubscribe(userId, room.code);
    if (room.isEmpty) {
      this.game.closed(room.code);
      await this.codes.release(room.code);
    }
  }

  private announceHost(room: Room, previousHost: number): void {
    if (room.host !== previousHost)
      this.events.notice(room.code, { type: 'host', nickname: room.nicknameOf(room.host) });
  }

  private rule<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof RoomRuleError) throw appError(error.code);
      throw error;
    }
  }

  private async reserveCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (await this.codes.reserve(code)) return code;
    }
    throw appError(ErrorCode.INTERNAL_ERROR);
  }
}
