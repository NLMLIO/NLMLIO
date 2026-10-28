import { useEffect, useState } from 'react';
import { ErrorCode } from '@nlmlio/shared';
import { ApiError, api, errorMessage } from '../../api/http';
import { useGameShortcuts } from '../../hooks/use-game-shortcuts';
import { GameBoard, type GameActions } from './GameBoard';
import { GameFrame } from './GameFrame';
import { GameResult } from './GameResult';
import type { GameView } from './game-view';
import { PREVIEW_RANKING, PREVIEW_SCENES, type PreviewScene } from './preview-scenes';

const SCENES = [...(Object.keys(PREVIEW_SCENES) as PreviewScene[]), 'result'] as const;

function sceneFromHash(): PreviewScene {
  const scene = location.hash.split('/')[1];
  return SCENES.find((name) => name === scene) ?? 'my-turn';
}

/**
 * 게임 화면 미리보기(#game/<장면>). 게임 엔진·소켓 이벤트가 아직 없어 고정된 상태를 그리고,
 * 카드 내기·종·채팅 같은 «의도»는 보낼 곳이 없어 아무 일도 하지 않는다.
 * 관전자의 방 나가기(FUNC-003-06·005-16)만 기존 방 나가기 API로 실제 동작한다.
 */
export function GamePreviewPage({
  onExit,
  onWaitingRoom,
}: {
  onExit: () => void;
  onWaitingRoom: () => void;
}) {
  const [scene, setScene] = useState(sceneFromHash);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  useEffect(() => {
    const hashChanged = () => {
      setScene(sceneFromHash());
      setLeaveError('');
    };
    window.addEventListener('hashchange', hashChanged);
    return () => window.removeEventListener('hashchange', hashChanged);
  }, []);
  const scenery = scene === 'result' ? null : PREVIEW_SCENES[scene];
  const spectating = scenery?.myPhase === 'spectating';

  // 탈락·이탈해 관전 중인 사람은 확인 없이 나가고, 정해진 순위는 그대로다(FUNC-003-06).
  async function leaveAsSpectator() {
    if (leaving) return;
    setLeaving(true);
    setLeaveError('');
    try {
      await api<void>('/rooms/me/leave', { method: 'POST' });
      onExit();
    } catch (cause) {
      // 이미 방에 없다면 나가려던 목적은 이룬 것이다.
      if (cause instanceof ApiError && cause.detail.code === ErrorCode.NOT_IN_ROOM) onExit();
      else setLeaveError(errorMessage(cause));
    } finally {
      setLeaving(false);
    }
  }

  const view: GameView | null =
    scenery && leaveError
      ? { ...scenery, banner: { tone: 'danger', messages: [`나가지 못했습니다 · ${leaveError}`] } }
      : scenery;
  const actions: GameActions = {
    onPlayCard: () => {},
    onRingBell: () => {},
    onLeave: spectating ? () => void leaveAsSpectator() : onExit,
    onSendChat: () => {},
    onSendEmote: () => {},
  };
  useGameShortcuts({
    j:
      view?.myPhase === 'turn'
        ? actions.onPlayCard
        : spectating && !leaving
          ? actions.onLeave
          : undefined,
    space: view && !spectating && view.bell.kind !== 'countdown' ? actions.onRingBell : undefined,
  });
  return (
    <>
      <GameFrame>
        {view ? (
          <GameBoard view={view} actions={actions} leaving={leaving} />
        ) : (
          <GameResult ranking={PREVIEW_RANKING} onLobby={onExit} onWaitingRoom={onWaitingRoom} />
        )}
      </GameFrame>
      {import.meta.env.DEV && (
        <nav className="scene-switcher" aria-label="미리보기 장면">
          {SCENES.map((name) => (
            <a key={name} href={`#game/${name}`} aria-current={name === scene ? 'page' : undefined}>
              {name}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}
