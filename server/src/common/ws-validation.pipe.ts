import { ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import { appError } from './app-error';

/** 소켓 페이로드도 HTTP와 같은 규칙으로 검증한다(CLAUDE.md 6.5) */
export const wsValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: () => appError(ErrorCode.VALIDATION_FAILED),
});
