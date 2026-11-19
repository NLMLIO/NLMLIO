import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from '../../common/security/access.guard';
import type { AuthenticatedRequest } from '../../common/security/access.guard';
import { CreateRoomDto, JoinRoomDto } from './dto/room.dto';
import { RoomService } from './room.service';

@Controller('rooms')
@UseGuards(AccessGuard)
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateRoomDto) {
    return this.rooms.create(request.account, input);
  }

  @Post('join')
  @HttpCode(200)
  join(@Req() request: AuthenticatedRequest, @Body() input: JoinRoomDto) {
    return this.rooms.join(request.account, input.code);
  }

  @Get('me')
  current(@Req() request: AuthenticatedRequest) {
    return this.rooms.current(request.account);
  }

  @Post('me/leave')
  @HttpCode(204)
  leave(@Req() request: AuthenticatedRequest) {
    return this.rooms.leave(request.account);
  }
}
