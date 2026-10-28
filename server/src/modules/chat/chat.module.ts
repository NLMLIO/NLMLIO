import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { RoomModule } from '../room/room.module';
import { ChatGateway } from './chat.gateway';
import { ChatLimiter } from './chat-limiter';
import { ChatPubSub } from './chat-pubsub';
import { ChatService } from './chat.service';

@Module({
  imports: [SecurityModule, RoomModule],
  providers: [ChatGateway, ChatLimiter, ChatPubSub, ChatService],
})
export class ChatModule {}
