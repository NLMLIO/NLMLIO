import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Deck } from '../../domain/card/deck';
import { Game } from '../../domain/game/game';
import type { StartGameInput } from '../../domain/game/game';

@Injectable()
export class GameFactory {
  create(input: StartGameInput): Game {
    return Game.create(
      input,
      Deck.standard().shuffle(() => randomInt(0x100000000) / 0x100000000),
    );
  }
}
