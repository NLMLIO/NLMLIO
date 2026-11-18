import { useEffect, useRef } from 'react';

interface GameShortcuts {
  /** J: 내 차례면 카드 내기, 관전 중이면 로비로 나가기 */
  j?: () => void;
  /** Space: 종 누르기 */
  space?: () => void;
  /** Q·W·E: 스킬 슬롯 0·1·2 사용 */
  skill?: (slot: number) => void;
}

const SLOT_CODES = ['KeyQ', 'KeyW', 'KeyE'];

/** 게임 단축키. 채팅 입력 중에는 동작하지 않고, 핸들러가 없으면 그 키는 무시한다 */
export function useGameShortcuts(shortcuts: GameShortcuts) {
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;
      const slot = SLOT_CODES.indexOf(event.code);
      const skill = latest.current.skill;
      const handler =
        event.code === 'Space'
          ? latest.current.space
          : event.code === 'KeyJ'
            ? latest.current.j
            : slot >= 0 && skill
              ? () => skill(slot)
              : undefined;
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
