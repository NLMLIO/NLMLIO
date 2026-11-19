import type { CSSProperties, ReactNode } from 'react';
import { useFitScale } from '../../hooks/use-fit-scale';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './game-view';

/** 1440×900 디자인 좌표계로 그린 게임 화면을 창 크기에 맞춰 비율 그대로 확대·축소한다 */
export function GameFrame({ children }: { children: ReactNode }) {
  const scale = useFitScale(SCREEN_WIDTH, SCREEN_HEIGHT);
  return (
    <div className="game-viewport">
      <div className="game-frame" style={{ '--game-scale': scale } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
