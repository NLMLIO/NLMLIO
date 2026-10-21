import { Module } from '@nestjs/common';
import { GameResultRepository } from '../../infra/database/game-result.repository';
import { GameResultService } from './game-result.service';

@Module({ providers: [GameResultRepository, GameResultService], exports: [GameResultService] })
export class GameModule {}
