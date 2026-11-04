import { Injectable } from '@nestjs/common';
import { GameServerEvent } from '@nlmlio/shared';
import type { GameSnapshot, GameActionEvent } from '@nlmlio/shared';
import type { Server } from 'socket.io';
import { roomChannel } from '../room/room.events';

@Injectable()
export class GameEvents {
  private server?: Server;
  attach(server: Server): void {
    this.server = server;
  }
  state(state: GameSnapshot): void {
    this.server?.to(roomChannel(state.roomCode)).emit(GameServerEvent.STATE, state);
  }
  action(code: string, action: GameActionEvent): void {
    this.server?.to(roomChannel(code)).emit(GameServerEvent.ACTION, action);
  }
}
