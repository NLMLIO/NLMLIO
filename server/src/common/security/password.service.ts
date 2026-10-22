import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// OWASP Password Storage Cheat Sheet의 Argon2id 최소 권장값(19 MiB, 2회, 병렬 1).
const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    if (encoded.startsWith('scrypt:')) return this.verifyLegacyScrypt(password, encoded);
    try {
      return await argon2.verify(encoded, password);
    } catch {
      return false;
    }
  }

  /** argon2 도입 전 scrypt 해시이거나 설정값이 바뀐 해시면 로그인 성공 시 다시 해시한다. */
  needsRehash(encoded: string): boolean {
    return encoded.startsWith('scrypt:') || argon2.needsRehash(encoded, ARGON2_OPTIONS);
  }

  private async verifyLegacyScrypt(password: string, encoded: string): Promise<boolean> {
    const [, salt, hash] = encoded.split(':');
    if (!salt || !hash) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
