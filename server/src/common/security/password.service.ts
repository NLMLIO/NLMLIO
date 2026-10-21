import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(24).toString('hex');
    const digest = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt:${salt}:${digest.toString('hex')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, salt, hash] = encoded.split(':');
    if (algorithm !== 'scrypt' || !salt || !hash) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
