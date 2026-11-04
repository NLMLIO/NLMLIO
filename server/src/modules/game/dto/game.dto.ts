import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import type { BellRingRequest, CardPlayRequest } from '@nlmlio/shared';

export class EmptyGameDto {}
export class GameIdDto {
  @IsString() @MaxLength(128) @Matches(/\S/) gameId!: string;
}
export class CardPlayDto extends GameIdDto implements CardPlayRequest {
  @IsInt() @Min(1) turnId!: number;
}
export class BellRingDto extends GameIdDto implements BellRingRequest {
  @IsInt() @Min(0) turnSeq!: number;
}
