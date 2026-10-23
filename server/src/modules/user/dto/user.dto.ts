import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NICKNAME_PATTERN, PASSWORD_PATTERN } from '@nlmlio/shared';
import type { UpdateProfileRequest } from '@nlmlio/shared';

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;
}

export class NicknameQuery {
  @IsString()
  @Matches(NICKNAME_PATTERN)
  nickname!: string;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(NICKNAME_PATTERN)
  nickname?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2048)
  nicknameCheckToken?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  currentPassword?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(PASSWORD_PATTERN)
  newPassword?: string;
}
