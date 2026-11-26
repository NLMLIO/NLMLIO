import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useFitScale } from '../../hooks/use-fit-scale';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './game-view';

/** 기기 비율에 관계없이 보드와 채팅을 하나의 1440×900 프레임으로 맞춘다. */
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
