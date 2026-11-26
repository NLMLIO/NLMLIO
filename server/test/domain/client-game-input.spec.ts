import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file: string, modules: Record<string, unknown> = {}, globals: object = {}) {
  const exports = {};
  const script = ts.transpileModule(
    readFileSync(resolve(__dirname, '../../../client/src', file), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  runInNewContext(script, { exports, require: (name: string) => modules[name], ...globals });
  return exports;
}

interface Sequence {
  playing: boolean;
  play: (send: () => Promise<string | null>) => Promise<string | null>;
  beforeBell: () => Promise<void>;
}
const { GameInputSequence } = load('pages/game/game-input-sequence.ts') as {
  GameInputSequence: new () => Sequence;
};

describe('서버가 허용한 손 접수 구간', () => {
  const { canJoinBellHandWindow } = load('pages/game/game-input-sequence.ts') as {
    canJoinBellHandWindow: (snapshot: object | null, userId: number) => boolean;
  };
  const snapshot = {
    bellHands: {
      turnSeq: 1,
      displayUntil: 2800,
      userIds: [2],
      eligibleUserIds: [1, 2],
    },
  };
  it('서버가 보낸 참가자·순서로만 판단하고 자기 손을 미리 추가하지 않는다', () => {
    expect(canJoinBellHandWindow(null, 1)).toBe(false);
    expect(canJoinBellHandWindow({ bellHands: null }, 1)).toBe(false);
    // 표시 마감과 상관없이 서버에 손 목록이 남아 있는 동안은 늦게 눌러도 보낸다.
    expect(canJoinBellHandWindow(snapshot, 1)).toBe(true);
    expect(canJoinBellHandWindow(snapshot, 2)).toBe(false);
    expect(canJoinBellHandWindow(snapshot, 99)).toBe(false);
    expect(snapshot.bellHands.userIds).toEqual([2]);
  });
});

describe('카드와 종 연속 입력', () => {
  it('카드 요청 중 종을 눌러도 버리지 않고 응답 뒤 최신 테이블 순번을 사용한다', async () => {
    const input = new GameInputSequence();
    let finish!: (value: string | null) => void;
    let turnSeq = 0;
    const card = input.play(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const bell = jest.fn();
    const ring = (async () => {
      await input.beforeBell();
      bell(turnSeq);
    })();
    await Promise.resolve();
    expect(bell).not.toHaveBeenCalled();
    turnSeq = 1;
    finish(null);
    await Promise.all([card, ring]);
    expect(bell).toHaveBeenCalledWith(1);
    expect(input.playing).toBe(false);
  });
  it('진행 중 중복 카드 입력은 한 번만 보내고 실패 응답 뒤에도 입력 잠금을 해제한다', async () => {
    const input = new GameInputSequence();
    let finish!: (value: string | null) => void;
    const send = jest.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        }),
    );
    const a = input.play(send),
      b = input.play(send);
    expect(send).toHaveBeenCalledTimes(1);
    finish('차례가 바뀌었어요');
    expect(await a).toBe('차례가 바뀌었어요');
    await b;
    await input.beforeBell();
    expect(input.playing).toBe(false);
  });
});

describe('게임 단축키 포커스', () => {
  function setup() {
    let listener!: (event: object) => void;
    let modal = false;
    class Element {
      isContentEditable = false;
      constructor(readonly kind: string) {}
      closest(selector: string) {
        const selectors = selector.split(',').map((value) => value.trim());
        return selectors.some(
          (value) =>
            value === this.kind ||
            (value === 'button' &&
              ['.action-button.play', '.bell-button', 'button'].includes(this.kind)),
        )
          ? this
          : null;
      }
    }
    const modules = {
      react: {
        useRef: (current: unknown) => ({ current }),
        useEffect: (effect: () => void) => effect(),
      },
    };
    const { useGameShortcuts } = load('hooks/use-game-shortcuts.ts', modules, {
      HTMLElement: Element,
      document: { querySelector: () => (modal ? {} : null) },
      window: {
        addEventListener: (_: string, callback: typeof listener) => {
          listener = callback;
        },
        removeEventListener: () => {},
      },
    }) as { useGameShortcuts: (handlers: { j: () => void; space: () => void }) => void };
    const j = jest.fn(),
      space = jest.fn();
    useGameShortcuts({ j, space });
    return {
      j,
      space,
      modal: () => {
        modal = true;
      },
      key: (code: string, kind: string) => {
        const preventDefault = jest.fn();
        listener({ code, target: new Element(kind), preventDefault });
        return preventDefault;
      },
    };
  }
  it('카드 버튼에 포커스가 있어도 J와 Space를 모두 처리하고 버튼의 중복 기본 동작을 막는다', () => {
    const input = setup();
    expect(input.key('KeyJ', '.action-button.play')).toHaveBeenCalledTimes(1);
    expect(input.key('Space', '.action-button.play')).toHaveBeenCalledTimes(1);
    expect(input.j).toHaveBeenCalledTimes(1);
    expect(input.space).toHaveBeenCalledTimes(1);
  });
  it('채팅·모달 입력과 일반 버튼의 Enter는 가로채지 않는다', () => {
    const input = setup();
    expect(input.key('KeyJ', 'input')).not.toHaveBeenCalled();
    expect(input.key('Enter', 'button')).not.toHaveBeenCalled();
    input.modal();
    expect(input.key('Space', '.bell-button')).not.toHaveBeenCalled();
    expect(input.j).not.toHaveBeenCalled();
    expect(input.space).not.toHaveBeenCalled();
  });
});
