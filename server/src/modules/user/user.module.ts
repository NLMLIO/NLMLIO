import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { RoomModule } from '../room/room.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [SecurityModule, RoomModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
