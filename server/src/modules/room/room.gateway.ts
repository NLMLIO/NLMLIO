import { HttpException, Logger, UseFilters, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { ErrorCode, RoomClientEvent, RoomServerEvent, SocketAuthEvent } from '@nlmlio/shared';
import type { RoomAck } from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import { TokenService } from '../../common/security/token.service';
import { socketUser } from '../../common/socket-user';
import type { SocketUser } from '../../common/socket-user';
import { WsAckFilter } from '../../common/ws-ack.filter';
import { wsValidationPipe } from '../../common/ws-validation.pipe';
import { UserRepository } from '../../infra/database/user.repository';
import { RoomMoveDto, RoomTargetDto, SocketAuthDto } from './dto/room.dto';
import { RoomEvents, roomChannel, userChannel } from './room.events';
import type { RoomServer } from './room.events';
import { RoomService } from './room.service';

const OK: RoomAck = { ok: true };

@WebSocketGateway()
@UseFilters(WsAckFilter)
@UsePipes(wsValidationPipe)
export class RoomGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RoomGateway.name);

  constructor(
    private readonly rooms: RoomService,
    private readonly events: RoomEvents,
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
  ) {}

  afterInit(server: RoomServer): void {
    this.events.attach(server);
    // handshake의 Access 토큰을 검증한다. 실패하면 연결을 받지 않고 앱 에러 코드를 돌려준다.
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((error: unknown) => {
          const code =
            error instanceof HttpException
              ? (error.getResponse() as { code: string }).code
              : ErrorCode.TOKEN_INVALID;
          if (!(error instanceof HttpException)) this.logger.error(error);
          // 채팅 게이트웨이와 같은 형식: message와 data.code 모두 앱 에러 코드
          next(Object.assign(new Error(code), { data: { code } }));
        });
    });
  }

  handleConnection(socket: Socket): void {
    const { userId } = socketUser(socket);
    void socket.join(userChannel(userId));
    const room = this.rooms.memberRoom(userId);
    if (room) void socket.join(roomChannel(room.code));
    socket.emit(RoomServerEvent.STATE, room);
  }

  @SubscribeMessage(SocketAuthEvent.REFRESH)
  async refresh(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: SocketAuthDto,
  ): Promise<RoomAck> {
    await this.authenticate(socket, input.token);
    return OK;
  }

  @SubscribeMessage(RoomClientEvent.MOVE)
  async move(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: RoomMoveDto,
  ): Promise<RoomAck> {
    await this.authenticate(socket);
    this.rooms.move(socketUser(socket).userId, input.userId, input.role);
    return OK;
  }

  @SubscribeMessage(RoomClientEvent.KICK)
  async kick(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: RoomTargetDto,
  ): Promise<RoomAck> {
    await this.authenticate(socket);
    await this.rooms.kick(socketUser(socket).userId, input.userId);
    return OK;
  }

  @SubscribeMessage(RoomClientEvent.DELEGATE)
  async delegate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: RoomTargetDto,
  ): Promise<RoomAck> {
    await this.authenticate(socket);
    this.rooms.delegate(socketUser(socket).userId, input.userId);
    return OK;
  }

  private async authenticate(socket: Socket, replacement?: string): Promise<void> {
    const token: unknown = replacement ?? socket.data.accessToken ?? socket.handshake.auth?.token;
    const claims = await this.tokens.verify(typeof token === 'string' ? token : '', 'access');
    const account = await this.users.findById(claims.sub);
    if (
      !account ||
      account.authVersion !== claims.version ||
      (socket.data.userId !== undefined && socket.data.userId !== account.id)
    )
      throw appError(ErrorCode.TOKEN_INVALID);
    (socket.data as SocketUser).userId = account.id;
    socket.data.accessToken = token;
  }
}
