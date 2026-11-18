import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as shared from '@nlmlio/shared';

const script = ts.transpileModule(
  readFileSync(resolve(__dirname, '../../../client/src/socket/socket.ts'), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;

describe('클라이언트 소켓 인증 갱신과 의도 응답', () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());
  function setup() {
    const events = new Map<string, () => void>();
    const window = new EventTarget();
    let token = 'first';
    let expiry = 60_000;
    const refreshSession = jest.fn(async () => {
      token = 'renewed';
      expiry = Date.now() + 900_000;
      window.dispatchEvent(new Event('nlmlio:access-token'));
    });
    const emitWithAck = jest.fn(async (event: string) =>
      event === shared.SocketAuthEvent.REFRESH ? { ok: true } : { ok: true, ignored: true },
    );
    const socket = {
      connected: false,
      on: (name: string, callback: () => void) => events.set(name, callback),
      connect: jest.fn(() => {
        socket.connected = true;
        events.get('connect')?.();
      }),
      disconnect: jest.fn(() => {
        socket.connected = false;
      }),
      emit: jest.fn(),
      timeout: () => ({ emitWithAck }),
    };
    const roomActions = Object.fromEntries(
      ['connection', 'state', 'notice', 'kicked', 'chat', 'emoji', 'game'].map((key) => [
        key,
        jest.fn(),
      ]),
    );
    const modules: Record<string, unknown> = {
      'socket.io-client': { io: () => socket },
      '@nlmlio/shared': shared,
      '../api/http': {
        ApiError: class extends Error {},
        codeMessage: () => '오류',
        getAccessToken: () => token,
        accessExpiresAt: () => expiry,
        refreshSession,
      },
      '../audio/sounds': { playSound: jest.fn() },
      '../stores/game-store': {
        useGameStore: { getState: () => ({ snapshot: null }) },
        gameActions: { state: jest.fn(), action: jest.fn() },
      },
      '../stores/room-store': { roomActions, useRoomStore: { getState: () => ({ room: null }) } },
    };
    const exports = {};
    runInNewContext(script, {
      exports,
      require: (name: string) => {
        if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
        return modules[name];
      },
      window,
      document: {
        visibilityState: 'visible',
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      setTimeout,
      clearTimeout,
      Date,
      Event,
    });
    const api = exports as {
      connectSocket: () => void;
      disconnectSocket: () => void;
      sendGameIntent: (event: string, payload: object) => Promise<string | null>;
    };
    api.connectSocket();
    return { api, socket, emitWithAck, refreshSession };
  }
  it('만료 30초 전에 갱신하고 소켓을 끊지 않은 채 새 토큰을 전송한다', async () => {
    const { api, socket, emitWithAck, refreshSession } = setup();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(refreshSession).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(emitWithAck).toHaveBeenCalledWith(shared.SocketAuthEvent.REFRESH, { token: 'renewed' });
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    api.disconnectSocket();
    await jest.advanceTimersByTimeAsync(900_000);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
  it('무시된 종·카드 요청은 성공으로 숨기지 않고 각각의 안내를 반환한다', async () => {
    const { api } = setup();
    expect(await api.sendGameIntent(shared.GameClientEvent.BELL, {})).toContain('이미 판정된 종');
    expect(await api.sendGameIntent(shared.GameClientEvent.PLAY, {})).toContain('차례나 판정 상태');
    api.disconnectSocket();
  });
});
