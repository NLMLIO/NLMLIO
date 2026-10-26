import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './infra/database/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { GameModule } from './modules/game/game.module';
import { RoomModule } from './modules/room/room.module';

@Module({
  imports: [
    // 환경변수 파일은 main.ts의 loadEnvFiles()가 이미 읽었다.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    RedisModule,
    UserModule,
    AuthModule,
    RankingModule,
    GameModule,
    RoomModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
