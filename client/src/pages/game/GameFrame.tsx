import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useFitScale } from '../../hooks/use-fit-scale';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './game-view';

/** 1440×900 디자인 좌표계로 그린 게임 화면을 창 크기에 맞춰 비율 그대로 확대·축소한다 */
export function GameFrame({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const scale = useFitScale(SCREEN_WIDTH, SCREEN_HEIGHT, viewport);
  return (
    <div className="game-viewport" ref={viewport}>
      <div
        className="game-fit"
        style={{ width: SCREEN_WIDTH * scale, height: SCREEN_HEIGHT * scale }}
      >
        <div className="game-frame" style={{ '--game-scale': scale } as CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}
