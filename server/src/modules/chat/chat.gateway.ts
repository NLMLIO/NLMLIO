import { HttpException, Logger, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ChatEvent, ErrorCode } from '@nlmlio/shared';
import type { ChatAck } from '@nlmlio/shared';
import type { Server, Socket } from 'socket.io';
import { appError } from '../../common/app-error';
import { TokenService } from '../../common/security/token.service';
import type { UserAccount } from '../../domain/user/account';
import { UserRepository } from '../../infra/database/user.repository';
import { ChatJoinDto, ChatSendDto, EmojiSendDto } from './dto/chat.dto';
import { ChatService } from './chat.service';
import { ChatPubSub } from './chat-pubsub';
import type { ChatBroadcast } from './chat-pubsub';

const inputPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: () => appError(ErrorCode.VALIDATION_FAILED),
});

@WebSocketGateway()
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
    private readonly chat: ChatService,
    private readonly pubsub: ChatPubSub,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch((error: unknown) => {
          const code = this.errorCode(error);
          next(Object.assign(new Error(code), { data: { code } }));
        });
    });
    this.pubsub.register((message) => this.deliver(message));
  }

  @SubscribeMessage(ChatEvent.JOIN)
  async join(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown): Promise<ChatAck> {
    return this.respond(socket, async () => {
      const account = await this.authenticate(socket);
      const { code } = await inputPipe.transform(raw, { type: 'body', metatype: ChatJoinDto });
      this.chat.join(account.id, code);
      for (const room of socket.rooms) if (room.startsWith('chat:')) await socket.leave(room);
      await socket.join(`chat:${code}`);
    });
  }

  @SubscribeMessage(ChatEvent.LEAVE)
  async leave(@ConnectedSocket() socket: Socket): Promise<ChatAck> {
    return this.respond(socket, async () => {
      await this.authenticate(socket);
      for (const room of socket.rooms) if (room.startsWith('chat:')) await socket.leave(room);
    });
  }

  @SubscribeMessage(ChatEvent.SEND)
  async send(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown): Promise<ChatAck> {
    return this.respond(socket, async () => {
      const account = await this.authenticate(socket);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw appError(ErrorCode.CHAT_TOO_LONG);
      const { message } = await inputPipe.transform(raw, { type: 'body', metatype: ChatSendDto });
      if (!socket.rooms.has(`chat:${this.chat.roomCode(account.id)}`))
        throw appError(ErrorCode.NOT_IN_ROOM);
      await this.chat.text(account, message);
    });
  }

  @SubscribeMessage(ChatEvent.EMOJI_SEND)
  async sendEmoji(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ): Promise<ChatAck> {
    return this.respond(socket, async () => {
      const account = await this.authenticate(socket);
      const { emoji } = await inputPipe.transform(raw, { type: 'body', metatype: EmojiSendDto });
      if (!socket.rooms.has(`chat:${this.chat.roomCode(account.id)}`))
        throw appError(ErrorCode.NOT_IN_ROOM);
      await this.chat.emoji(account, emoji);
    });
  }

  private async authenticate(socket: Socket): Promise<UserAccount> {
    const token =
      (socket.data.accessToken as string | undefined) ??
      (typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined);
    if (!token) throw appError(ErrorCode.TOKEN_INVALID);
    const claims = await this.tokens.verify(token, 'access');
    const account = await this.users.findById(claims.sub);
    if (!account || account.authVersion !== claims.version) throw appError(ErrorCode.TOKEN_INVALID);
    socket.data.userId = account.id;
    socket.data.accessToken = token;
    return account;
  }

  private async respond(socket: Socket, action: () => Promise<void>): Promise<ChatAck> {
    try {
      await action();
      return { ok: true };
    } catch (error) {
      const code = this.errorCode(error);
      socket.emit(ChatEvent.ERROR, { code });
      if (code === ErrorCode.INTERNAL_ERROR)
        this.logger.error(error instanceof Error ? error.name : 'Unknown chat error');
      return { ok: false, code };
    }
  }

  private errorCode(error: unknown): ErrorCode {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response && 'code' in response)
        return response.code as ErrorCode;
    }
    return ErrorCode.INTERNAL_ERROR;
  }

  private async deliver(message: ChatBroadcast): Promise<void> {
    const room = `chat:${message.event.roomCode}`;
    for (const socket of await this.server.in(room).fetchSockets()) {
      const userId = socket.data.userId as number | undefined;
      let authorized = false;
      try {
        const token = socket.data.accessToken as string | undefined;
        if (token && userId) {
          const claims = await this.tokens.verify(token, 'access');
          const account = await this.users.findById(claims.sub);
          authorized =
            claims.sub === userId &&
            account?.authVersion === claims.version &&
            this.chat.roomCode(userId) === message.event.roomCode;
        }
      } catch {
        // 만료·폐기된 소켓은 다음 메시지부터 방 수신 대상에서 제외한다.
      }
      if (!authorized) {
        await socket.leave(room);
        continue;
      }
      socket.emit(message.kind === 'text' ? ChatEvent.MESSAGE : ChatEvent.EMOJI, message.event);
    }
  }
}
