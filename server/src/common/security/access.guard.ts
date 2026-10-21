import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '@nlmlio/shared';
import type { UserAccount } from '../../domain/user/account';
import { UserRepository } from '../../infra/database/user.repository';
import { appError } from '../app-error';
import { TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  account: UserAccount;
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
    if (!match) throw appError(ErrorCode.TOKEN_INVALID);
    const claims = await this.tokens.verify(match[1], 'access');
    const account = await this.users.findById(claims.sub);
    if (!account || account.authVersion !== claims.version) throw appError(ErrorCode.TOKEN_INVALID);
    request.account = account;
    return true;
  }
}
