import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as shared from '@nlmlio/shared';
import ts from 'typescript';

interface Store {
  useGameStore: {
    getState: () => { spitHits: Record<number, { endsAt: number; layer: number }[]> };
    setState: (partial: object) => void;
  };
  gameEvents?: object;
  [name: string]: unknown;
}

/** 클라이언트 게임 스토어를 그대로 불러온다. 시계는 `clock.now`로 고정한다 */
function loadStore(clock: { now: number }) {
  const exports = {} as Store;
  const script = ts.transpileModule(
    readFileSync(resolve(__dirname, '../../../client/src/stores/game-store.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  let state: Record<string, unknown> = {};
  const create = (init: () => Record<string, unknown>) => {
    state = init();
    return {
      getState: () => state,
      setState: (partial: object | ((current: object) => object)) => {
        state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
      },
    };
  };
  const modules: Record<string, unknown> = { zustand: { create }, '@nlmlio/shared': shared };
  runInNewContext(script, {
    exports,
    require: (name: string) => modules[name],
    Date: { now: () => clock.now },
  });
  return exports;
}

describe('침 뱉기를 연속으로 맞은 화면', () => {
  const duration = shared.SPIT_COVER_MS + shared.SPIT_DRIP_MS;
  const setup = () => {
    const clock = { now: 1000 };
    const store = loadStore(clock);
    const events = Object.values(store).find(
      (value): value is { action: (event: object) => boolean } =>
        typeof (value as { action?: unknown })?.action === 'function',
    )!;
    let revision = 1;
    store.useGameStore.setState({ snapshot: { gameId: 'g', revision, players: [] } });
    const spit = (at: number) => {
      clock.now = at;
      events.action({
        gameId: 'g',
        revision: ++revision,
        kind: 'skill',
        userId: 1,
        skillId: 'SPIT',
        targetUserId: 2,
      });
      return store.useGameStore.getState().spitHits[2];
    };
    return { spit };
  };

  it('처음부터 다시 시작하지 않고, 앞의 침은 제 시간에 끝난 채 새 침이 겹친다', () => {
    const { spit } = setup();
    spit(1000);
    const hits = spit(2000);
    expect(hits.map((hit) => [hit.endsAt, hit.layer])).toEqual([
      [1000 + duration, 0],
      [2000 + duration, 1],
    ]);
    expect(spit(2500).map((hit) => hit.layer)).toEqual([0, 1, 2]);
  });

  it('끝난 침은 버리고, 남은 침이 있으면 그 위의 새 자리에 쌓는다', () => {
    const { spit } = setup();
    spit(1000);
    spit(4000);
    // 첫 침만 끝난 뒤
    expect(spit(1000 + duration + 1).map((hit) => hit.layer)).toEqual([1, 2]);
    // 모두 끝난 뒤에는 처음 자리부터
    expect(spit(100_000).map((hit) => hit.layer)).toEqual([0]);
  });
});
