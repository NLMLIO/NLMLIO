import { useEffect, useState } from 'react';
import type { HealthResponse } from '@nlmlio/shared';

// 개발 환경 확인용 첫 화면. 화면 전환(로그인 / 로비 / 대기실 / 게임 …)은 기능 구현 때 만든다.
export function App() {
  const [health, setHealth] = useState<HealthResponse | 'error' | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth, () => setHealth('error'));
  }, []);

  return (
    <main>
      <h1>낼래말래io</h1>
      <p>
        서버 상태:{' '}
        {health === null
          ? '확인 중…'
          : health === 'error'
            ? '서버에 연결할 수 없음'
            : `${health.status} (DB ${health.database ? 'O' : 'X'}, Redis ${health.redis ? 'O' : 'X'})`}
      </p>
    </main>
  );
}
