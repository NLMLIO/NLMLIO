import { useEffect, useRef } from 'react';

interface GameShortcuts {
  /** J: 내 차례에 카드 내기 */
  j?: () => void;
  /** Space: 종 누르기 */
  space?: () => void;
  /** Q·W·E: 스킬 슬롯 0·1·2 사용 */
  skill?: (slot: number) => void;
  /** 종 옮기기로 바뀐 종 치기 키(예: `KeyK`). 이 동안 Space는 쓰지 않는다 */
  bell?: { code: string; run: () => void };
  /** 종 야바위: 종마다의 단축키. 번호가 같은 종을 친다 */
  bells?: { key: string; run: () => void }[];
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
        document.querySelector('[aria-modal="true"]') !== null ||
        isTyping(event.target)
      )
        return;
      const slot = SLOT_CODES.indexOf(event.code);
      const skill = latest.current.skill;
      const bell = latest.current.bell;
      const shellBell = latest.current.bells?.find(
        (entry) =>
          event.code === `Digit${entry.key}` ||
          (event.code === `Numpad${entry.key}` && event.key === entry.key),
      );
      const handler = shellBell
        ? shellBell.run
        : bell && event.code === bell.code
          ? bell.run
          : event.code === 'Space'
            ? latest.current.space
            : event.code === 'KeyJ'
              ? latest.current.j
              : slot >= 0 && skill
                ? () => skill(slot)
                : undefined;
      if (!handler) {
        // 야바위 중 Space가 포커스된 종 버튼의 기본 click으로 바뀌지 않도록 한다.
        if (
          event.code === 'Space' &&
          event.target instanceof HTMLElement &&
          event.target.closest('.bell-shell-bell, .skill-dock .skill-slot-button, .bell-button')
        )
          event.preventDefault();
        return;
      }
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
    (target.isContentEditable ||
      target.closest('input, textarea, select, [role="dialog"], [role="alertdialog"]') !== null ||
      (target.closest('button, a') !== null &&
        target.closest(
          '.action-button.play, .bell-button, .bell-shell-bell, .skill-dock .skill-slot-button',
        ) === null))
  );
}
