import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@nlmlio/shared';
import { appError } from '../app-error';
import type { UserAccount } from '../../domain/user/account';

interface SessionClaims {
  sub: number;
  version: number;
  /** 기기 세션 ID. 로그인마다 새로 만들고 재발급 때는 그대로 이어 간다. */
  sid: string;
  purpose: 'access' | 'refresh';
  exp: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secret(kind: 'access' | 'refresh'): string {
    const secret = this.config.getOrThrow<string>(
      kind === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET',
    );
    if (secret.length < 32) throw new Error('JWT secrets must contain at least 32 characters');
    return secret;
  }

  async issue(
    user: UserAccount,
    sessionId: string = randomUUID(),
  ): Promise<{ accessToken: string; refreshToken: string; refreshTtl: number; sessionId: string }> {
    const refreshTtl = this.ttl(this.config.get('JWT_REFRESH_TTL', '14d'));
    const claims = { sub: user.id, version: user.authVersion, sid: sessionId, jti: randomUUID() };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...claims, purpose: 'access' },
        {
          secret: this.secret('access'),
          algorithm: 'HS256',
          expiresIn: this.ttl(this.config.get('JWT_ACCESS_TTL', '15m')),
        },
      ),
      this.jwt.signAsync(
        { ...claims, purpose: 'refresh' },
        {
          secret: this.secret('refresh'),
          algorithm: 'HS256',
          expiresIn: refreshTtl,
        },
      ),
    ]);
    return { accessToken, refreshToken, refreshTtl, sessionId };
  }

  async verify(token: string, kind: 'access' | 'refresh'): Promise<SessionClaims> {
    try {
      const claims = await this.jwt.verifyAsync<SessionClaims>(token, {
        secret: this.secret(kind),
        algorithms: ['HS256'],
      });
      if (
        claims.purpose !== kind ||
        !Number.isSafeInteger(claims.sub) ||
        !Number.isSafeInteger(claims.version) ||
        typeof claims.sid !== 'string'
      ) {
        throw new Error('Invalid session claims');
      }
      return claims;
    } catch (error) {
      throw appError(
        error instanceof Error && error.name === 'TokenExpiredError'
          ? ErrorCode.TOKEN_EXPIRED
          : ErrorCode.TOKEN_INVALID,
      );
    }
  }

  async nicknameProof(nickname: string): Promise<string> {
    return this.jwt.signAsync(
      { nickname, purpose: 'nickname-check' },
      {
        secret: this.secret('access'),
        algorithm: 'HS256',
        expiresIn: 600,
      },
    );
  }

  async verifyNicknameProof(token: string | undefined, nickname: string): Promise<void> {
    try {
      const claims = await this.jwt.verifyAsync<{ nickname: string; purpose: string }>(
        token ?? '',
        {
          secret: this.secret('access'),
          algorithms: ['HS256'],
        },
      );
      if (claims.purpose !== 'nickname-check' || claims.nickname !== nickname)
        throw new Error('Mismatched nickname');
    } catch {
      throw appError(ErrorCode.VALIDATION_FAILED, {
        nickname: '닉네임 중복 확인을 다시 해주세요.',
      });
    }
  }

  private ttl(value: string): number {
    const match = /^(\d+)([smhd])?$/.exec(value);
    if (!match) throw new Error('Invalid JWT TTL configuration');
    const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    const seconds = Number(match[1]) * units[match[2] ?? 's'];
    if (!Number.isSafeInteger(seconds) || seconds < 1)
      throw new Error('Invalid JWT TTL configuration');
    return seconds;
  }
}
