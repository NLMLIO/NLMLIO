import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// 저장소 루트. src/config와 dist/config 모두 세 단계 위다.
const REPO_ROOT = resolve(__dirname, '../../..');

/**
 * 워크스페이스 포트(.superset/workspace.env)를 먼저, 그다음 .env를 읽는다.
 * 이미 있는 값은 덮어쓰지 않으므로 셸 환경 > workspace.env > .env 순서로 우선한다.
 * process.loadEnvFile 대신 직접 넣는 이유: Jest는 테스트마다 process.env 복사본을 써서
 * loadEnvFile로 넣은 값이 테스트 안에서 보이지 않는다.
 */
export function loadEnvFiles(root = REPO_ROOT): void {
  for (const file of ['.superset/workspace.env', '.env']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
      process.env[key] ??= value;
    }
  }
}

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(env.POSTGRES_USER ?? 'nlmlio');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? 'nlmlio');
  const db = env.POSTGRES_DB ?? 'nlmlio';
  const port = env.POSTGRES_PORT ?? '5432';
  return `postgresql://${user}:${password}@localhost:${port}/${db}`;
}

export function redisUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.REDIS_URL ?? `redis://localhost:${env.REDIS_PORT ?? '6379'}`;
}

export function serverPort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.SERVER_PORT ?? 3000);
}
