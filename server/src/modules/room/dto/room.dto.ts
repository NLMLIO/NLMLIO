import { IsIn, IsInt, IsString, Matches, MaxLength } from 'class-validator';
import { ROOM_CODE_PATTERN, ROOM_NAME_MAX_LENGTH, RoomRole } from '@nlmlio/shared';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  RoomMovePayload,
  RoomTargetPayload,
} from '@nlmlio/shared';

export class CreateRoomDto implements CreateRoomRequest {
  @IsString()
  @MaxLength(ROOM_NAME_MAX_LENGTH)
  @Matches(/\S/)
  roomName!: string;
}

export class JoinRoomDto implements JoinRoomRequest {
  @IsString()
  @Matches(ROOM_CODE_PATTERN)
  code!: string;
}

export class RoomTargetDto implements RoomTargetPayload {
  @IsInt()
  userId!: number;
}

export class RoomMoveDto extends RoomTargetDto implements RoomMovePayload {
  @IsIn(Object.values(RoomRole))
  role!: RoomRole;
}
