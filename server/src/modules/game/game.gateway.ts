import { Logger, UseFilters, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ErrorCode, GameClientEvent, GameServerEvent, RoomClientEvent } from '@nlmlio/shared';
import type { GameAck } from '@nlmlio/shared';
import { appError } from '../../common/app-error';
import { TokenService } from '../../common/security/token.service';
import { socketUser } from '../../common/socket-user';
import { WsAckFilter } from '../../common/ws-ack.filter';
import { wsValidationPipe } from '../../common/ws-validation.pipe';
import { UserRepository } from '../../infra/database/user.repository';
import { CardPlayDto, BellRingDto, EmptyGameDto } from './dto/game.dto';
import { GameEvents, stamped } from './game.events';
import { GameService } from './game.service';

@WebSocketGateway()
@UseFilters(WsAckFilter)
@UsePipes(wsValidationPipe)
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  constructor(
    private readonly games: GameService,
    private readonly events: GameEvents,
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
  ) {}
  afterInit(server: Server): void {
    this.events.attach(server);
  }
  handleConnection(socket: Socket): void {
    const { userId } = socketUser(socket);
    void this.games
      .connected(userId, socket.id)
      .then(() => {
        socket.emit(GameServerEvent.STATE, stamped(this.games.sync(userId)));
      })
      .catch(() => this.logger.warn('Game connection sync failed'));
  }
  handleDisconnect(socket: Socket): void {
    void this.games
      .disconnected(socketUser(socket).userId, socket.id)
      .catch(() => this.logger.warn('Game disconnect handling failed'));
  }
  @SubscribeMessage(RoomClientEvent.START)
  async start(
    @ConnectedSocket() socket: Socket,
    @MessageBody() _input: EmptyGameDto,
  ): Promise<GameAck> {
    await this.games.start(socketUser(socket).userId, () => this.authorize(socket));
    return { ok: true };
  }
  @SubscribeMessage(GameClientEvent.PLAY)
  async play(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: CardPlayDto,
  ): Promise<GameAck> {
    const accepted = await this.games.play(socketUser(socket).userId, input, Date.now(), () =>
      this.authorize(socket),
    );
    return { ok: true, ...(!accepted ? { ignored: true } : {}) };
  }
  @SubscribeMessage(GameClientEvent.BELL)
  async bell(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: BellRingDto,
  ): Promise<GameAck> {
    const accepted = await this.games.bell(socketUser(socket).userId, input, Date.now(), () =>
      this.authorize(socket),
    );
    return { ok: true, ...(!accepted ? { ignored: true } : {}) };
  }
  @SubscribeMessage(GameClientEvent.SYNC)
  async sync(
    @ConnectedSocket() socket: Socket,
    @MessageBody() _input: EmptyGameDto,
  ): Promise<GameAck> {
    await this.authorize(socket);
    socket.emit(GameServerEvent.STATE, stamped(this.games.sync(socketUser(socket).userId)));
    return { ok: true };
  }
  @SubscribeMessage(GameClientEvent.RETURN)
  async returnToRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() _input: EmptyGameDto,
  ): Promise<GameAck> {
    await this.games.returnToRoom(socketUser(socket).userId, () => this.authorize(socket));
    socket.emit(GameServerEvent.STATE, null);
    return { ok: true };
  }
  private async authorize(socket: Socket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token;
    const claims = await this.tokens.verify(typeof token === 'string' ? token : '', 'access');
    const account = await this.users.findById(claims.sub);
    if (
      !account ||
      account.authVersion !== claims.version ||
      claims.sub !== socketUser(socket).userId
    )
      throw appError(ErrorCode.TOKEN_INVALID);
  }
}
