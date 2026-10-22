import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import type { LoginRequest, RegisterRequest } from '@nlmlio/shared';
import { PasswordService } from '../../common/security/password.service';
import { TokenService } from '../../common/security/token.service';
import { SessionService } from '../../common/security/session.service';
import { appError } from '../../common/app-error';
import { toPublicUser } from '../../infra/database/user.repository';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async register(input: RegisterRequest) {
    await this.tokens.verifyNicknameProof(input.nicknameCheckToken, input.nickname);
    return this.users.createAccount({
      username: input.username,
      nickname: input.nickname,
      email: input.email.toLowerCase(),
      passwordHash: await this.passwords.hash(input.password),
    });
  }

  async login(input: LoginRequest) {
    const user = await this.users.findForLogin(input.username);
    // Also hash a dummy password when the account is absent to reduce timing differences.
    const hash = user?.passwordHash ?? (await this.passwords.hash('invalid-account-password'));
    if (!(await this.passwords.verify(input.password, hash)) || !user)
      throw appError(ErrorCode.INVALID_CREDENTIALS);
    if (this.passwords.needsRehash(user.passwordHash))
      await this.users.upgradePasswordHash(user, await this.passwords.hash(input.password));
    const session = await this.tokens.issue(user);
    await this.sessions.save(user.id, session.sessionId, session.refreshToken, session.refreshTtl);
    return { ...session, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string) {
    const claims = await this.tokens.verify(refreshToken, 'refresh');
    const user = await this.users.requireAccount(claims.sub);
    if (claims.version !== user.authVersion) throw appError(ErrorCode.TOKEN_INVALID);
    const session = await this.tokens.issue(user, claims.sid);
    if (
      !(await this.sessions.rotate(
        user.id,
        claims.sid,
        refreshToken,
        session.refreshToken,
        session.refreshTtl,
      ))
    ) {
      throw appError(ErrorCode.TOKEN_INVALID);
    }
    return { ...session, user: toPublicUser(user) };
  }

  async logout(refreshToken: string) {
    try {
      const claims = await this.tokens.verify(refreshToken, 'refresh');
      await this.sessions.revokeIfMatches(claims.sub, claims.sid, refreshToken);
    } catch {
      // Logout also succeeds when a cookie is already absent or expired.
    }
  }
}
