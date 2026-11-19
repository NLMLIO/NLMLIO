import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { RankingService } from './ranking.service';
import { RankingController } from './ranking.controller';

@Module({
  imports: [SecurityModule],
  providers: [RankingService],
  controllers: [RankingController],
})
export class RankingModule {}
