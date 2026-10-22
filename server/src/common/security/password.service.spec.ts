import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('Argon2id로 해시하고 같은 비밀번호만 통과시킨다', async () => {
    const encoded = await passwords.hash('Password123');
    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(passwords.verify('Password123', encoded)).resolves.toBe(true);
    await expect(passwords.verify('Password124', encoded)).resolves.toBe(false);
  });

  it('72바이트를 넘는 한글 비밀번호도 끝까지 비교한다', async () => {
    const base = '가'.repeat(30);
    const encoded = await passwords.hash(`${base}a1`);
    await expect(passwords.verify(`${base}a2`, encoded)).resolves.toBe(false);
  });

  it('형식이 깨진 해시는 예외 없이 실패한다', async () => {
    await expect(passwords.verify('Password123', 'garbage')).resolves.toBe(false);
  });
});
