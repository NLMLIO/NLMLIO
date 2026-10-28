import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_NAME_MAX_LENGTH } from '@nlmlio/shared';
import type { CreateRoomRequest } from '@nlmlio/shared';

export class CreateRoomDto implements CreateRoomRequest {
  @IsString()
  @MaxLength(ROOM_NAME_MAX_LENGTH)
  @Matches(/\S/)
  roomName!: string;

  @IsInt()
  @Min(MIN_PLAYERS)
  @Max(MAX_PLAYERS)
  maxPlayers!: number;
}
