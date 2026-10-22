import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

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
    try {
      return await argon2.verify(encoded, password);
    } catch {
      return false;
    }
  }
}
