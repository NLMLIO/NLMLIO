import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test/domain'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/generated/**'],
  coverageDirectory: './coverage',
  // Prisma가 생성한 코드는 './x.js'처럼 확장자를 붙여 import한다. Jest에서는 .ts로 찾게 한다.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  passWithNoTests: true,
};

export default config;
