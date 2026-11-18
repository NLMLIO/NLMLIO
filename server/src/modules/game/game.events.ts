import { Injectable } from '@nestjs/common';
import { GameServerEvent } from '@nlmlio/shared';
import type {
  GameActionEvent,
  GameSnapshot,
  GameStateEvent,
  SkillStateEvent,
} from '@nlmlio/shared';
import type { Server } from 'socket.io';
import { roomChannel, userChannel } from '../room/room.events';

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
  /** 이미 연결된 유저가 진행 중인 방에 들어와도 재접속 없이 현재 상태를 받는다. */
  sync(userId: number, state: GameSnapshot): void {
    this.server?.to(userChannel(userId)).emit(GameServerEvent.STATE, stamped(state));
  }
  /** 후보·보유 스킬은 본인에게만 보낸다 */
  skills(userId: number, state: SkillStateEvent | null): void {
    this.server?.to(userChannel(userId)).emit(GameServerEvent.SKILLS, state);
  }
  action(code: string, action: GameActionEvent): void {
    this.server?.to(roomChannel(code)).emit(GameServerEvent.ACTION, action);
  }
}
