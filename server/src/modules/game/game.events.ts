import { Injectable } from '@nestjs/common';
import { GameServerEvent } from '@nlmlio/shared';
import type { GameActionEvent, GameSnapshot, GameStateEvent } from '@nlmlio/shared';
import type { Server } from 'socket.io';
import { roomChannel } from '../room/room.events';

/** 보내는 순간의 서버 시각을 붙인다. 도메인 스냅샷은 시계를 모른다. */
export const stamped = (state: GameSnapshot | null): GameStateEvent | null =>
  state && { ...state, serverTime: Date.now() };

@Injectable()
export class GameEvents {
  private server?: Server;
  attach(server: Server): void {
    this.server = server;
  }
  state(state: GameSnapshot): void {
    this.server?.to(roomChannel(state.roomCode)).emit(GameServerEvent.STATE, stamped(state));
  }
  action(code: string, action: GameActionEvent): void {
    this.server?.to(roomChannel(code)).emit(GameServerEvent.ACTION, action);
  }
}
