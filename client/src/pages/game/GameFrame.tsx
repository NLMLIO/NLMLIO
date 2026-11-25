import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useFitScale } from '../../hooks/use-fit-scale';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './game-view';

/**
 * 1440×900 디자인 좌표계로 그린 게임 화면을 창 높이에 맞춰 비율 그대로 확대·축소한다.
 * 창이 16:10보다 가로로 길면 남는 폭만큼 화면 폭을 늘려(보드는 채팅 왼쪽 영역의 가운데에 둔다) 좌우 여백을 없앤다.
 */
export function GameFrame({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const { scale, stageWidth } = useFitScale(SCREEN_WIDTH, SCREEN_HEIGHT, viewport);
  return (
    <div className="game-viewport" ref={viewport}>
      <div
        className="game-fit"
        style={{ width: stageWidth * scale, height: SCREEN_HEIGHT * scale }}
      >
        <div
          className="game-frame"
          style={{ '--game-scale': scale, '--stage-width': `${stageWidth}px` } as CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
