import { Injectable } from '@nestjs/common';
import type { Room } from '../../domain/room/room';

/** 진행 중인 방의 인메모리 저장소. 서버 1대 전제다. */
@Injectable()
export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOfUser = new Map<number, string>();

  findByMember(userId: number): Room | undefined {
    const code = this.roomOfUser.get(userId);
    return code === undefined ? undefined : this.rooms.get(code);
  }

  add(room: Room, userId: number): void {
    this.rooms.set(room.code, room);
    this.roomOfUser.set(userId, room.code);
  }

  removeMember(room: Room, userId: number): void {
    this.roomOfUser.delete(userId);
    if (room.isEmpty) this.rooms.delete(room.code);
  }
}
