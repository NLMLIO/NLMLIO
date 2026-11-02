import {
  ErrorCode,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  ROOM_CODE_PATTERN,
  RoomRole,
  RoomStatus,
  validRoomName,
} from '@nlmlio/shared';
import type { RoomResponse } from '@nlmlio/shared';

export interface RoomUser {
  userId: number;
  nickname: string;
}

export interface CreateRoomInput {
  code: string;
  name: string;
  host: RoomUser;
}

/** 방 규칙 위반. 서비스가 같은 앱 에러 코드로 응답한다. */
export class RoomRuleError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

/**
 * 대기실 단위의 방. 2026-10-22 결정에 따라 모든 방은 비공개이고 코드로만 들어온다.
 * 참가자는 최대 MAX_PLAYERS명, 관전자는 최대 MAX_SPECTATORS명이다(2026-10-28 결정).
 */
export class Room {
  // Map은 넣은 순서를 지키므로 입장 순서가 곧 자리 순서와 방장 승계 순서다.
  private readonly members = new Map<number, { nickname: string; role: RoomRole }>();
  private hostId: number;
  private status: RoomStatus = RoomStatus.WAITING;

  private constructor(
    readonly code: string,
    private readonly name: string,
    host: RoomUser,
  ) {
    this.members.set(host.userId, { nickname: host.nickname, role: RoomRole.PLAYER });
    this.hostId = host.userId;
  }

  static create(input: CreateRoomInput): Room {
    if (!ROOM_CODE_PATTERN.test(input.code) || !validRoomName(input.name)) {
      throw new Error('Invalid room');
    }
    return new Room(input.code, input.name.trim(), input.host);
  }

  has(userId: number): boolean {
    return this.members.has(userId);
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  get host(): number {
    return this.hostId;
  }

  nicknameOf(userId: number): string {
    return this.member(userId).nickname;
  }

  roleOf(userId: number): RoomRole {
    return this.member(userId).role;
  }

  /** 코드로 들어온다. 참가자 자리가 있으면 참가자로, 없으면 관전자로 앉는다. */
  join(user: RoomUser): RoomRole {
    this.requireWaiting();
    if (this.has(user.userId)) throw new RoomRuleError(ErrorCode.ALREADY_IN_ROOM);
    const role = this.hasSeat(RoomRole.PLAYER) ? RoomRole.PLAYER : RoomRole.SPECTATOR;
    if (!this.hasSeat(role)) throw new RoomRuleError(ErrorCode.ROOM_FULL);
    this.members.set(user.userId, { nickname: user.nickname, role });
    return role;
  }

  /** 대기실에서 나간다. 방장이 나가면 가장 먼저 들어온 남은 회원이 방장이 된다. */
  leave(userId: number): void {
    if (!this.members.delete(userId)) throw new RoomRuleError(ErrorCode.NOT_IN_ROOM);
    if (userId === this.hostId && !this.isEmpty) this.hostId = this.members.keys().next().value!;
  }

  /** 자기 자리는 본인이, 다른 회원의 자리는 방장만 옮길 수 있다. 옮긴 회원은 그 칸의 맨 뒤로 간다. */
  move(actorId: number, targetId: number, role: RoomRole): boolean {
    this.requireWaiting();
    if (actorId !== targetId) this.requireHost(actorId);
    const target = this.member(targetId);
    if (target.role === role) return false;
    if (!this.hasSeat(role)) throw new RoomRuleError(ErrorCode.ROOM_FULL);
    this.members.delete(targetId);
    this.members.set(targetId, { ...target, role });
    return true;
  }

  /** 방장이 다른 회원을 내보낸다. 추방된 회원도 코드로 다시 들어올 수 있다. */
  kick(actorId: number, targetId: number): void {
    this.requireWaiting();
    this.requireHost(actorId);
    if (actorId === targetId) throw new RoomRuleError(ErrorCode.VALIDATION_FAILED);
    this.member(targetId);
    this.leave(targetId);
  }

  /** 방장 권한을 참가자·관전자 누구에게나 넘긴다. */
  delegate(actorId: number, targetId: number): void {
    this.requireWaiting();
    this.requireHost(actorId);
    if (actorId === targetId) throw new RoomRuleError(ErrorCode.VALIDATION_FAILED);
    this.member(targetId);
    this.hostId = targetId;
  }

  /** 게임에서 탈락·이탈한 회원을 방에 남긴 채 관전자로 돌린다(FUNC-005-16). 게임 중에도 쓴다. */
  markSpectator(userId: number): void {
    const member = this.member(userId);
    this.members.set(userId, { ...member, role: RoomRole.SPECTATOR });
  }

  /** 참가자가 2명 이상이면 방장이 게임을 시작한다. 관전자는 그대로 관전한다. */
  start(actorId: number): void {
    this.requireWaiting();
    this.requireHost(actorId);
    if (this.count(RoomRole.PLAYER) < MIN_PLAYERS)
      throw new RoomRuleError(ErrorCode.NOT_ENOUGH_PLAYERS);
    this.status = RoomStatus.PLAYING;
  }

  snapshot(): RoomResponse {
    return {
      code: this.code,
      name: this.name,
      status: this.status,
      hostId: this.hostId,
      members: [...this.members].map(([userId, member]) => ({ userId, ...member })),
    };
  }

  private member(userId: number) {
    const member = this.members.get(userId);
    if (!member) throw new RoomRuleError(ErrorCode.USER_NOT_FOUND);
    return member;
  }

  private count(role: RoomRole): number {
    return [...this.members.values()].filter((member) => member.role === role).length;
  }

  private hasSeat(role: RoomRole): boolean {
    return this.count(role) < (role === RoomRole.PLAYER ? MAX_PLAYERS : MAX_SPECTATORS);
  }

  private requireHost(userId: number): void {
    if (userId !== this.hostId) throw new RoomRuleError(ErrorCode.NOT_ROOM_HOST);
  }

  private requireWaiting(): void {
    if (this.status !== RoomStatus.WAITING) throw new RoomRuleError(ErrorCode.ROOM_IN_GAME);
  }
}
