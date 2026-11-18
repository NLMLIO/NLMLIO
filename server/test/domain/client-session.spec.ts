import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// 별도 클라이언트 러너 없이 기존 Jest에서 실제 HTTP 모듈을 두 탭의 독립 메모리로 실행한다.
const script = ts.transpileModule(
  readFileSync(resolve(__dirname, '../../../client/src/api/http.ts'), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
type TabSession = {
  refreshSession: () => Promise<{ accessToken: string }>;
  getAccessToken: () => string;
};

describe('다중 탭 Refresh 경쟁', () => {
  let cookie: number;
  let rejected: number;
  const fetch = async () => {
    const sent = cookie;
    await Promise.resolve();
    if (sent !== cookie) {
      rejected++;
      return { status: 401, ok: false, json: async () => ({ code: 'TOKEN_INVALID' }) };
    }
    cookie++;
    return {
      status: 200,
      ok: true,
      json: async () => ({ accessToken: `access-${cookie}`, user: { id: 1 } }),
    };
  };
  const tab = (locks?: {
    request: (name: string, action: () => Promise<unknown>) => Promise<unknown>;
  }) => {
    const exports = {};
    runInNewContext(script, {
      exports,
      fetch,
      navigator: { locks },
      window: { dispatchEvent: () => {} },
      Event: class {},
      setTimeout,
    });
    return exports as TabSession;
  };
  beforeEach(() => {
    cookie = 0;
    rejected = 0;
  });
  it('Web Locks를 쓰면 두 탭의 공용 쿠키 회전을 직렬화하고 둘 다 로그인 상태를 유지한다', async () => {
    let queue = Promise.resolve<unknown>(undefined);
    const locks = {
      request: (_name: string, action: () => Promise<unknown>) => (queue = queue.then(action)),
    };
    const a = tab(locks),
      b = tab(locks);
    await Promise.all([a.refreshSession(), b.refreshSession()]);
    expect(rejected).toBe(0);
    expect(a.getAccessToken()).toBe('access-1');
    expect(b.getAccessToken()).toBe('access-2');
  });
  it('Web Locks가 없는 LAN HTTP 환경은 최신 공용 쿠키로 재시도하며 이전 토큰 재사용을 허용하지 않는다', async () => {
    jest.useFakeTimers();
    try {
      const a = tab(),
        b = tab();
      const refreshed = Promise.all([a.refreshSession(), b.refreshSession()]);
      await jest.advanceTimersByTimeAsync(500);
      await refreshed;
      expect(rejected).toBe(1);
      expect(a.getAccessToken()).toBe('access-1');
      expect(b.getAccessToken()).toBe('access-2');
    } finally {
      jest.useRealTimers();
    }
  });
});
