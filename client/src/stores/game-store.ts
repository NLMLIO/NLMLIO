import { create } from 'zustand';
import { GameStatus, TURN_TIME_MS } from '@nlmlio/shared';
import type { GameAction, GameActionEvent, GameCard, GameSnapshot } from '@nlmlio/shared';

type BellAction = Extract<GameAction, { kind: 'bell' }>;

/** 서버가 보낸 종 판정. 판정 직전 테이블(서버가 보낸 공개 카드)을 함께 기억해 화면이 근거를 보여 준다. */
export interface BellEvent {
  id: number;
  action: BellAction;
  /** 판정 직전 각 플레이어의 맨 위 공개 카드 */
  tableBefore: { userId: number; card: GameCard }[];
}

/** 방금 공개된 카드. 뒤집기 애니메이션과 '자동' 표시에 쓴다. */
export interface CardEvent {
  id: number;
  userId: number;
  automatic: boolean;
}

interface GameState {
  snapshot: GameSnapshot | null;
  lastBell: BellEvent | null;
  lastCard: CardEvent | null;
  /** 연결이 끊긴 플레이어별로 끊김 이벤트를 받은 이 브라우저 시각 */
  offlineSince: Record<number, number>;
  /** 서버 시각 − 이 브라우저 시각 추정치. 턴 마감 시각을 남은 초로 바꿀 때 쓴다 */
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
  lastCard: null,
  offlineSince: {},
  clockOffset: 0,
  returnedGameId: null,
}));

export const gameActions = {
  /** `game:state`. null이면 이 회원에게 보여 줄 게임이 없다 */
  state(next: GameSnapshot | null) {
    useGameStore.setState((state) => {
      const prev = state.snapshot;
      if (!next) {
        return {
          snapshot: null,
          lastBell: null,
          lastCard: null,
          offlineSince: {},
          returnedGameId: prev?.status === GameStatus.ENDED ? prev.gameId : state.returnedGameId,
        };
      }
      if (next.gameId === state.returnedGameId && next.status === GameStatus.ENDED) return state;
      const sameGame = prev?.gameId === next.gameId;
      if (sameGame && next.revision < prev.revision) return state;
      // 새 차례가 시작된 스냅샷의 마감 시각은 «지금 서버 시각 + 10초»이므로 시계 차이를 다시 잰다.
      const turnChanged = !sameGame || prev.turnId !== next.turnId;
      const clockOffset =
        turnChanged && next.turnDeadline !== null && next.status === GameStatus.PLAYING
          ? next.turnDeadline - TURN_TIME_MS - Date.now()
          : state.clockOffset;
      const offlineSince = Object.fromEntries(
        next.players
          .filter((player) => !player.connected)
          .map((player) => [player.userId, state.offlineSince[player.userId] ?? Date.now()]),
      );
      return {
        snapshot: next,
        clockOffset,
        offlineSince,
        ...(sameGame ? {} : { lastBell: null, lastCard: null, returnedGameId: null }),
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
        useGameStore.setState({
          lastCard: { id: nextId++, userId: event.userId, automatic: event.automatic },
        });
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
