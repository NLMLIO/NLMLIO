import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode } from '@nlmlio/shared';
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

const MAX_CODE_ATTEMPTS = 20;

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomStore,
    private readonly codes: RoomCodeRegistry,
    private readonly events: RoomEvents,
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
    return { room: this.snapshotOf(account.id) };
  }

  snapshotOf(userId: number): RoomResponse | null {
    return this.rooms.findByMember(userId)?.snapshot() ?? null;
  }

  async leave(account: UserAccount): Promise<void> {
    const room = this.memberRoom(account.id);
    const nickname = room.nicknameOf(account.id);
    const host = room.host;
    room.leave(account.id);
    await this.removed(room, account.id);
    if (room.isEmpty) return;
    this.events.notice(room.code, { type: 'left', nickname });
    this.announceHost(room, host);
    this.events.state(room);
  }

  move(actorId: number, targetId: number, role: RoomRole): void {
    const room = this.memberRoom(actorId);
    if (!this.rule(() => room.move(actorId, targetId, role))) return;
    this.events.notice(room.code, { type: 'moved', nickname: room.nicknameOf(targetId), role });
    this.events.state(room);
  }

  async kick(actorId: number, targetId: number): Promise<void> {
    const room = this.memberRoom(actorId);
    const nickname = this.rule(() => room.nicknameOf(targetId));
    this.rule(() => room.kick(actorId, targetId));
    await this.removed(room, targetId);
    this.events.kicked(targetId);
    this.events.notice(room.code, { type: 'kicked', nickname });
    this.events.state(room);
  }

  delegate(actorId: number, targetId: number): void {
    const room = this.memberRoom(actorId);
    this.rule(() => room.delegate(actorId, targetId));
    this.announceHost(room, actorId);
    this.events.state(room);
  }

  start(actorId: number): void {
    const room = this.memberRoom(actorId);
    this.rule(() => room.start(actorId));
    this.events.notice(room.code, { type: 'started' });
    this.events.state(room);
  }

  private memberRoom(userId: number): Room {
    const room = this.rooms.findByMember(userId);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    return room;
  }

  private async removed(room: Room, userId: number): Promise<void> {
    this.rooms.removeMember(room, userId);
    this.events.unsubscribe(userId, room.code);
    if (room.isEmpty) await this.codes.release(room.code);
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
