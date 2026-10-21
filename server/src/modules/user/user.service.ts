import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@nlmlio/shared';
import type {
  DashboardResponse,
  NicknameCheckResponse,
  PublicUser,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '@nlmlio/shared';
import type {
  CreateAccountInput,
  UserAccount,
  ChangeAccountInput,
} from '../../domain/user/account';
import { PlayerStatistics } from '../../domain/user/player-statistics';
import { UserRepository, toPublicUser, uniqueConflict } from '../../infra/database/user.repository';
import { HistoryRepository } from '../../infra/database/history.repository';
import { PasswordService } from '../../common/security/password.service';
import { TokenService } from '../../common/security/token.service';
import { SessionService } from '../../common/security/session.service';
import { appError } from '../../common/app-error';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly history: HistoryRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  findForLogin(username: string): Promise<UserAccount | null> {
    return this.users.findByUsername(username);
  }

  async requireAccount(id: number): Promise<UserAccount> {
    const user = await this.users.findById(id);
    if (!user) throw appError(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  async createAccount(input: CreateAccountInput): Promise<PublicUser> {
    try {
      return toPublicUser(await this.users.create(input));
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async nicknameAvailability(nickname: string): Promise<NicknameCheckResponse> {
    const available = !(await this.users.findByNickname(nickname));
    return {
      nickname,
      available,
      checkToken: available ? await this.tokens.nicknameProof(nickname) : '',
    };
  }

  async dashboard(user: UserAccount): Promise<DashboardResponse> {
    const [rank, totals] = await Promise.all([
      this.users.rankOf(user),
      this.history.totals(user.id),
    ]);
    return { user: toPublicUser(user), rank, stats: new PlayerStatistics(totals).toSnapshot() };
  }

  async updateProfile(
    account: UserAccount,
    input: UpdateProfileRequest,
  ): Promise<UpdateProfileResponse> {
    const changes: ChangeAccountInput = {};
    if (input.nickname !== undefined && input.nickname !== account.nickname) {
      await this.tokens.verifyNicknameProof(input.nicknameCheckToken, input.nickname);
      const other = await this.users.findByNickname(input.nickname);
      if (other && other.id !== account.id) throw appError(ErrorCode.NICKNAME_TAKEN);
      changes.nickname = input.nickname;
    }
    if (input.email !== undefined) changes.email = input.email.toLowerCase();
    if (input.newPassword !== undefined) {
      if (
        !input.currentPassword ||
        !(await this.passwords.verify(input.currentPassword, account.passwordHash))
      ) {
        throw appError(ErrorCode.INVALID_CREDENTIALS);
      }
      changes.passwordHash = await this.passwords.hash(input.newPassword);
    } else if (input.currentPassword) {
      throw appError(ErrorCode.VALIDATION_FAILED, { newPassword: '새 비밀번호를 입력해주세요.' });
    }

    try {
      const updated = await this.users.update(account, changes);
      if (!updated) throw appError(ErrorCode.TOKEN_INVALID);
      if (changes.passwordHash) await this.sessions.revoke(account.id);
      return { user: toPublicUser(updated), requiresLogin: Boolean(changes.passwordHash) };
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private rethrowConflict(error: unknown): never {
    const fields = uniqueConflict(error);
    if (fields) {
      if (fields.includes('nickname')) throw appError(ErrorCode.NICKNAME_TAKEN);
      if (fields.includes('email')) throw appError(ErrorCode.EMAIL_TAKEN);
      if (fields.includes('username')) throw appError(ErrorCode.USERNAME_TAKEN);
    }
    throw error;
  }
}
