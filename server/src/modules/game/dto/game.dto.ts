import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  BellRingRequest,
  CardPlayRequest,
  SkillChoice,
  SkillPickRequest,
  SkillUseRequest,
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
  @IsOptional() @IsInt() @Min(0) @Max(4) bell?: number;
}
/** 스킬 후보 선택(FUNC-009-03). 칸 번호·교체 칸의 범위는 도메인이 검사한다 */
export class SkillPickDto extends GameIdDto implements SkillPickRequest {
  @IsObject() choice!: SkillChoice;
}
/** 스킬 사용(FUNC-009-04). 보유 칸 번호와 대상(대상 지정 스킬만)을 보낸다 */
export class SkillUseDto extends GameIdDto implements SkillUseRequest {
  @IsInt() @Min(0) @Max(2) slot!: number;
  @IsOptional() @IsInt() @Min(1) targetUserId?: number;
}
