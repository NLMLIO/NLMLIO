import { IsString, Matches, MaxLength } from 'class-validator';
import { NICKNAME_PATTERN, PASSWORD_PATTERN, USERNAME_PATTERN } from '@nlmlio/shared';
import type { LoginRequest, RegisterRequest } from '@nlmlio/shared';

export class LoginDto implements LoginRequest {
  @IsString()
  @Matches(USERNAME_PATTERN)
  username!: string;

  @IsString()
  @MaxLength(64)
  password!: string;
}

export class RegisterDto implements RegisterRequest {
  @IsString()
  @Matches(USERNAME_PATTERN)
  username!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN)
  password!: string;

  @IsString()
  @Matches(NICKNAME_PATTERN)
  nickname!: string;

  @IsString()
  @MaxLength(2048)
  nicknameCheckToken!: string;
}
