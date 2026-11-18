import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('JWT 시작 시 설정 검증', () => {
  const config = {
    JWT_ACCESS_SECRET: 'test-access-key-at-least-thirty-two-characters',
    JWT_REFRESH_SECRET: 'test-refresh-key-at-least-thirty-two-characters',
  };
  it('정상 설정으로 시작한다', () => {
    expect(() =>
      new TokenService(new JwtService(), new ConfigService(config)).onModuleInit(),
    ).not.toThrow();
  });
  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    '%s가 짧으면 첫 로그인 전 시작 단계에서 실패한다',
    (key) => {
      expect(() =>
        new TokenService(
          new JwtService(),
          new ConfigService({ ...config, [key]: 'short' }),
        ).onModuleInit(),
      ).toThrow('at least 32');
    },
  );
  it('잘못된 TTL도 시작 단계에서 거부한다', () => {
    expect(() =>
      new TokenService(
        new JwtService(),
        new ConfigService({ ...config, JWT_ACCESS_TTL: 'bad' }),
      ).onModuleInit(),
    ).toThrow('TTL');
  });
});
