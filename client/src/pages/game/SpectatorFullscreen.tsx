import { useEffect, useState } from 'react';

/** 전체 게임 프레임을 확대해 관전 중에도 채팅과 스킬 선택 창을 함께 유지한다. */
export function SpectatorFullscreen() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    function changed() {
      setActive(document.fullscreenElement?.classList.contains('game-viewport') ?? false);
    }
    changed();
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  if (!document.fullscreenEnabled) return null;
  return (
    <>
      <button
        type="button"
        className="game-chip spectator-fullscreen"
        aria-pressed={active}
        onClick={async (event) => {
          const viewport = event.currentTarget.closest('.game-viewport');
          if (!viewport) return;
          try {
            setError(false);
            if (document.fullscreenElement === viewport) await document.exitFullscreen();
            else await viewport.requestFullscreen();
          } catch {
            setError(true);
          }
        }}
      >
        {active ? '전체화면 종료' : '전체화면'}
      </button>
      {error && (
        <span className="fullscreen-error" role="status">
          전체화면을 열 수 없어요.
        </span>
      )}
    </>
  );
}
