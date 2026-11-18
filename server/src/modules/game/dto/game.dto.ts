import { IsInt, IsObject, IsString, Matches, MaxLength, Min } from 'class-validator';
import type {
  BellRingRequest,
  CardPlayRequest,
  SkillChoice,
  SkillPickRequest,
} from '@nlmlio/shared';

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
/** 스킬 후보 선택(FUNC-009-03). 칸 번호·교체 칸의 범위는 도메인이 검사한다 */
export class SkillPickDto extends GameIdDto implements SkillPickRequest {
  @IsObject() choice!: SkillChoice;
}
