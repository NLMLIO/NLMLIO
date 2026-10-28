import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_PATTERN,
  RoomStatus,
  validRoomName,
} from '@nlmlio/shared';
import type { RoomMember, RoomResponse } from '@nlmlio/shared';

export interface CreateRoomInput {
  code: string;
  name: string;
  maxPlayers: number;
  host: RoomMember;
}

/** 대기실 단위의 방. 2026-10-22 결정에 따라 모든 방은 비공개이고 코드로만 들어온다. */
export class Room {
  private readonly members = new Map<number, RoomMember>();
  private hostId: number;
  private status: RoomStatus = RoomStatus.WAITING;

  private constructor(
    readonly code: string,
    private readonly name: string,
    private readonly maxPlayers: number,
    host: RoomMember,
  ) {
    this.members.set(host.userId, { ...host });
    this.hostId = host.userId;
  }

  static create(input: CreateRoomInput): Room {
    if (
      !ROOM_CODE_PATTERN.test(input.code) ||
      !validRoomName(input.name) ||
      !Number.isInteger(input.maxPlayers) ||
      input.maxPlayers < MIN_PLAYERS ||
      input.maxPlayers > MAX_PLAYERS
    ) {
      throw new Error('Invalid room');
    }
    return new Room(input.code, input.name.trim(), input.maxPlayers, input.host);
  }

  has(userId: number): boolean {
    return this.members.has(userId);
  }

  /** 방 참가 API가 붙으면 이 메서드와 RoomStore.addMember를 함께 호출한다. */
  join(member: RoomMember): void {
    if (this.status !== RoomStatus.WAITING || this.members.size >= this.maxPlayers)
      throw new Error('Room cannot accept another member');
    if (this.members.has(member.userId)) throw new Error('Already a room member');
    this.members.set(member.userId, { ...member });
  }

  markSpectator(userId: number): void {
    const member = this.members.get(userId);
    if (!member) throw new Error('Not a room member');
    this.members.set(userId, { ...member, isSpectator: true });
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  /** 대기실에서 나간다. 방장이 나가면 가장 먼저 들어온 남은 회원이 방장이 된다. */
  leave(userId: number): void {
    if (!this.members.delete(userId)) throw new Error('Not a room member');
    if (userId === this.hostId && !this.isEmpty) this.hostId = this.members.keys().next().value!;
  }

  snapshot(): RoomResponse {
    return {
      code: this.code,
      name: this.name,
      maxPlayers: this.maxPlayers,
      status: this.status,
      hostId: this.hostId,
      members: [...this.members.values()].map((member) => ({ ...member })),
    };
  }
}
