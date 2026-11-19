import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './infra/database/prisma.module';
import { RedisModule } from './infra/redis/redis.module';

@Module({
  imports: [
    // 환경변수 파일은 main.ts의 loadEnvFiles()가 이미 읽었다.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    RedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
