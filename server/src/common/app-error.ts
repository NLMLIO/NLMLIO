import { HttpException } from '@nestjs/common';
import { ERROR_HTTP_STATUS, ErrorCode } from '@nlmlio/shared';

export function appError(code: ErrorCode, fields?: Record<string, string>): HttpException {
  return new HttpException({ code, ...(fields ? { fields } : {}) }, ERROR_HTTP_STATUS[code]);
}
