import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { RoomServerEvent } from '@nlmlio/shared';
import type {
  RoomClientToServerEvents,
  RoomNotice,
  RoomServerToClientEvents,
} from '@nlmlio/shared';
import type { Room } from '../../domain/room/room';

export type RoomServer = Server<RoomClientToServerEvents, RoomServerToClientEvents>;

export const userChannel = (userId: number) => `user:${userId}`;
export const roomChannel = (code: string) => `room:${code}`;

/** 방 상태 변화를 소켓으로 내보낸다. Gateway가 초기화되면서 Socket.io 서버를 넘겨준다. */
@Injectable()
export class RoomEvents {
  private server?: RoomServer;

  attach(server: RoomServer): void {
    this.server = server;
  }

  /** 회원의 모든 탭을 방 채널에 넣는다 */
  subscribe(userId: number, code: string): void {
    this.server?.in(userChannel(userId)).socketsJoin(roomChannel(code));
  }

  unsubscribe(userId: number, code: string): void {
    this.server?.in(userChannel(userId)).socketsLeave(roomChannel(code));
    this.server?.to(userChannel(userId)).emit(RoomServerEvent.STATE, null);
  }

  state(room: Room): void {
    if (room.isEmpty) return;
    this.server?.to(roomChannel(room.code)).emit(RoomServerEvent.STATE, room.snapshot());
  }

  notice(code: string, notice: RoomNotice): void {
    this.server?.to(roomChannel(code)).emit(RoomServerEvent.NOTICE, notice);
  }

  kicked(userId: number): void {
    this.server?.to(userChannel(userId)).emit(RoomServerEvent.KICKED);
  }
}
