import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserRepository } from './user.repository';
import { HistoryRepository } from './history.repository';

@Global()
@Module({
  providers: [PrismaService, UserRepository, HistoryRepository],
  exports: [PrismaService, UserRepository, HistoryRepository],
})
export class PrismaModule {}
