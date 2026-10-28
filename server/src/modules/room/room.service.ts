import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ErrorCode } from '@nlmlio/shared';
import type { CreateRoomRequest, CurrentRoomResponse, RoomResponse } from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import type { UserAccount } from '../../domain/user/account';
import { Room } from '../../domain/room/room';
import { RoomStore } from '../../infra/game-state/room.store';
import { RoomCodeRegistry } from '../../infra/redis/room-code.registry';

const MAX_CODE_ATTEMPTS = 20;

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomStore,
    private readonly codes: RoomCodeRegistry,
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
      maxPlayers: input.maxPlayers,
      host: { userId: account.id, nickname: account.nickname },
    });
    this.rooms.add(room, account.id);
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
    const room = this.rooms.findByMember(userId);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    room.markSpectator(userId);
  }

  async leave(account: UserAccount): Promise<void> {
    const room = this.rooms.findByMember(account.id);
    if (!room) throw appError(ErrorCode.NOT_IN_ROOM);
    room.leave(account.id);
    this.rooms.removeMember(room, account.id);
    if (room.isEmpty) await this.codes.release(room.code);
  }

  private async reserveCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (await this.codes.reserve(code)) return code;
    }
    throw appError(ErrorCode.INTERNAL_ERROR);
  }
}
