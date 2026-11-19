import { databaseUrl } from './env';

describe('배포 DB 연결 URL', () => {
  it('사용자·비밀번호·DB 이름의 예약 문자를 인코딩하고 컨테이너 호스트를 사용한다', () => {
    const value = databaseUrl({
      POSTGRES_HOST: 'postgres',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'a@b',
      POSTGRES_PASSWORD: 'p:#/?%',
      POSTGRES_DB: 'game space',
    });
    const parsed = new URL(value);
    expect(parsed.hostname).toBe('postgres');
    expect(decodeURIComponent(parsed.username)).toBe('a@b');
    expect(decodeURIComponent(parsed.password)).toBe('p:#/?%');
    expect(decodeURIComponent(parsed.pathname)).toBe('/game space');
  });
  it('명시적인 DATABASE_URL은 그대로 사용한다', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgresql://custom/db' })).toBe('postgresql://custom/db');
  });
});
