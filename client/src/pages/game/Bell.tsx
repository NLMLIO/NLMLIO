import bellIcon from '../../assets/game/bell.svg';
import bellMisfireIcon from '../../assets/game/bell-misfire.svg';
import bellSuccessIcon from '../../assets/game/bell-success.svg';
import type { CSSProperties } from 'react';
import type { BellMoveView, BellState } from './game-view';

/** 종 옮기기로 종이 옮겨 가는 자리(보드 좌표 오프셋). 테이블 위 대각선 4곳 */
const MOVE_OFFSETS = [
  { x: 150, y: -125 },
  { x: -150, y: -125 },
  { x: 150, y: 125 },
  { x: -150, y: 125 },
];

interface BellProps {
  state: BellState;
  pileCount: number;
  disabled: boolean;
  onRing: () => void;
  /** 종 옮기기 진행 중이면 옮겨진 자리와 새 키 */
  moved?: BellMoveView;
}

/** 테이블 가운데 종과 종 아래 보관 스택 수. 판정 결과에 따라 라임(정답)·핑크(오발) 링이 켜진다 */
export function Bell({ state, pileCount, disabled, onRing, moved }: BellProps) {
  const glow = state.kind === 'success' || state.kind === 'misfire' ? state.kind : null;
  const icon =
    glow === 'success' ? bellSuccessIcon : glow === 'misfire' ? bellMisfireIcon : bellIcon;
  return (
    <div
      className={`bell${moved ? ' is-moved' : ''}`}
      style={
        moved
          ? ({
              '--bell-dx': `${MOVE_OFFSETS[moved.position % MOVE_OFFSETS.length].x}px`,
              '--bell-dy': `${MOVE_OFFSETS[moved.position % MOVE_OFFSETS.length].y}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {moved && (
        <span className="bell-key" role="status" aria-label={`${moved.key} 키로 치기`}>
          {moved.key}
        </span>
      )}
      {pileCount > 0 && (
        <div className="bell-storage" aria-hidden="true">
          {Array.from({ length: Math.min(pileCount, 3) }, (_, index) => (
            <span
              key={index}
              style={{
                transform: `rotate(${index * 7 - 7}deg) translate(${index * 3}px, ${index * 3}px)`,
              }}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        className={glow ? 'bell-button glow' : 'bell-button'}
        aria-label="종 누르기"
        aria-keyshortcuts={moved ? moved.key : 'Space'}
        disabled={disabled}
        onClick={onRing}
      >
        <img src={icon} alt="" />
      </button>
      {state.kind === 'countdown' && (
        <div className="bell-countdown" role="timer" aria-label={`${state.value}초 뒤 시작`}>
          {state.value}
        </div>
      )}
      {state.kind === 'last-chance' && (
        <p className="bell-last-chance" role="timer">
          마지막 종 기회 <b>{state.value}s</b>
        </p>
      )}
      <p className="bell-pile" aria-label={`종 아래 보관 카드 ${pileCount}장`}>
        보관 <span>{pileCount}장</span>
      </p>
    </div>
  );
}
