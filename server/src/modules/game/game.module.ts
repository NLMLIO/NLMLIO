import { Module } from '@nestjs/common';
import { GameResultRepository } from '../../infra/database/game-result.repository';
import { GameResultService } from './game-result.service';
import { SecurityModule } from '../../common/security/security.module';
import { GameStore } from '../../infra/game-state/game.store';
import { RoomQueue } from '../../infra/game-state/room-queue';
import { GameStateRepository } from '../../infra/redis/game-state.repository';
import { RoomModule } from '../room/room.module';
import { GameEvents } from './game.events';
import { GameFactory } from './game.factory';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameTimers } from './game-timers';

@Module({
  imports: [SecurityModule, RoomModule],
  providers: [
    GameResultRepository,
    GameResultService,
    GameStore,
    RoomQueue,
    GameStateRepository,
    GameEvents,
    GameFactory,
    GameGateway,
    GameService,
    GameTimers,
  ],
  exports: [GameResultService, GameService],
})
export class GameModule {}
