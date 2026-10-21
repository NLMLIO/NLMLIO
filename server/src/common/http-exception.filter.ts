import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response.status(error.getStatus()).json(typeof body === 'object' ? body : { message: body });
      return;
    }
    // Never log payloads, credentials or raw database errors.
    this.logger.error(error instanceof Error ? error.name : 'Unknown server error');
    response.status(500).json({ code: ErrorCode.INTERNAL_ERROR });
  }
}
