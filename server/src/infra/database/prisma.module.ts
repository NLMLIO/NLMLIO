import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserRepository } from './user.repository';
import { HistoryRepository } from './history.repository';
import { RankingRepository } from './ranking.repository';

@Global()
@Module({
  providers: [PrismaService, UserRepository, HistoryRepository, RankingRepository],
  exports: [PrismaService, UserRepository, HistoryRepository, RankingRepository],
})
export class PrismaModule {}
