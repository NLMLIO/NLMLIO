import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { RoomStore } from '../../infra/game-state/room.store';
import { RoomCodeRegistry } from '../../infra/redis/room-code.registry';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

@Module({
  imports: [SecurityModule],
  controllers: [RoomController],
  providers: [RoomStore, RoomCodeRegistry, RoomService],
  exports: [RoomService],
})
export class RoomModule {}
