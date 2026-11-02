import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import type { ErrorResponse, RoomAck } from '@nlmlio/shared';

/** 소켓 이벤트에서 난 예외를 ack로 돌려준다. 소켓 에러에는 앱 에러 코드만 담는다. */
@Catch()
export class WsAckFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsAckFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ack = host
      .getArgs()
      .find((arg): arg is (result: RoomAck) => void => typeof arg === 'function');
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    if (exception instanceof HttpException) code = (exception.getResponse() as ErrorResponse).code;
    else this.logger.error(exception);
    ack?.({ ok: false, code });
  }
}
