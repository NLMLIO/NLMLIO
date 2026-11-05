import { create } from 'zustand';
import { GameStatus } from '@nlmlio/shared';
import type {
  GameAction,
  GameActionEvent,
  GameCard,
  GameSnapshot,
  GameStateEvent,
} from '@nlmlio/shared';

type BellAction = Extract<GameAction, { kind: 'bell' }>;

/** 서버가 보낸 종 판정. 판정 직전 테이블(서버가 보낸 공개 카드)을 함께 기억해 화면이 근거를 보여 준다. */
export interface BellEvent {
  id: number;
  action: BellAction;
  /** 판정 직전 각 플레이어의 맨 위 공개 카드 */
  tableBefore: { userId: number; card: GameCard }[];
}

/** 플레이어가 마지막으로 공개한 카드. 뒤집기 애니메이션(key)과 '자동' 표시에 쓴다. */
export interface CardEvent {
  id: number;
  automatic: boolean;
}

interface GameState {
  snapshot: GameSnapshot | null;
  lastBell: BellEvent | null;
  /** 플레이어별 마지막 카드 공개. 그 플레이어가 새 카드를 낼 때만 바뀐다 */
  lastCards: Record<number, CardEvent>;
  /** 연결이 끊긴 플레이어별로 끊김 이벤트를 받은 이 브라우저 시각 */
  offlineSince: Record<number, number>;
  /** 서버 시각 − 이 브라우저 시각 추정치(스냅샷의 serverTime으로 잰다). 턴 마감 시각을 남은 초로 바꿀 때 쓴다 */
  clockOffset: number;
  /** 결과 확인 뒤 대기실로 돌아간 게임. 이 게임의 종료 스냅샷이 늦게 와도 다시 띄우지 않는다 */
  returnedGameId: string | null;
}

let nextId = 1;

/**
 * 서버가 보낸 게임 상태의 거울(CLAUDE.md 6.6). 소켓 이벤트로만 바꾸고 규칙은 계산하지 않는다.
 * 오래된 이벤트는 서버가 붙인 revision으로 걸러낸다.
 */
export const useGameStore = create<GameState>(() => ({
  snapshot: null,
  lastBell: null,
  lastCards: {},
  offlineSince: {},
  clockOffset: 0,
  returnedGameId: null,
}));

export const gameActions = {
  /** `game:state`. null이면 이 회원에게 보여 줄 게임이 없다 */
  state(event: GameStateEvent | null) {
    useGameStore.setState((state) => {
      const prev = state.snapshot;
      if (!event) {
        return {
          snapshot: null,
          lastBell: null,
          lastCards: {},
          offlineSince: {},
          returnedGameId: prev?.status === GameStatus.ENDED ? prev.gameId : state.returnedGameId,
        };
      }
      // 전송 지연만큼 늦게 재지만, 재접속·동기화로 받은 진행 중 스냅샷에서도 같은 기준으로 잴 수 있다.
      const clockOffset = event.serverTime - Date.now();
      const { serverTime: _sentAt, ...next } = event;
      if (next.gameId === state.returnedGameId && next.status === GameStatus.ENDED)
        return { clockOffset };
      const sameGame = prev?.gameId === next.gameId;
      if (sameGame && next.revision < prev.revision) return { clockOffset };
      const offlineSince = Object.fromEntries(
        next.players
          .filter((player) => !player.connected)
          .map((player) => [player.userId, state.offlineSince[player.userId] ?? Date.now()]),
      );
      return {
        snapshot: next,
        clockOffset,
        offlineSince,
        ...(sameGame ? {} : { lastBell: null, lastCards: {}, returnedGameId: null }),
      };
    });
  },
  /** `game:action`. 받아들였으면 true(효과음·로그에 쓴다), 지난 이벤트면 false */
  action(event: GameActionEvent): boolean {
    const { snapshot } = useGameStore.getState();
    if (!snapshot || snapshot.gameId !== event.gameId || event.revision <= snapshot.revision)
      return false;
    switch (event.kind) {
      case 'card':
        useGameStore.setState((state) => ({
          lastCards: {
            ...state.lastCards,
            [event.userId]: { id: nextId++, automatic: event.automatic },
          },
        }));
        break;
      case 'bell':
        useGameStore.setState({
          lastBell: {
            id: nextId++,
            action: event,
            tableBefore: snapshot.players.flatMap((player) =>
              player.topCard ? [{ userId: player.userId, card: player.topCard }] : [],
            ),
          },
        });
        break;
      case 'connection':
        useGameStore.setState((state) => {
          const { [event.userId]: _back, ...rest } = state.offlineSince;
          return {
            offlineSince: event.connected ? rest : { ...rest, [event.userId]: Date.now() },
          };
        });
        break;
      case 'departed':
        break;
    }
    return true;
  },
};
