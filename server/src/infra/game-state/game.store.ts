import { Injectable } from '@nestjs/common';
import { Game } from '../../domain/game/game';

export interface GameSession {
  game: Game;
  settled: boolean;
  cleared: boolean;
  returnedToRoom: boolean;
  closed: boolean;
  marked: Set<number>;
}
@Injectable()
export class GameStore {
  private readonly sessions = new Map<string, GameSession>();
  get(code: string): GameSession | undefined {
    return this.sessions.get(code);
  }
  set(game: Game): GameSession {
    const session = {
      game,
      settled: false,
      cleared: false,
      returnedToRoom: false,
      closed: false,
      marked: new Set<number>(),
    };
    this.sessions.set(game.roomCode, session);
    return session;
  }
  delete(code: string): void {
    this.sessions.delete(code);
  }
}
