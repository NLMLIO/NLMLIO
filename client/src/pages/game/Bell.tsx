import bellIcon from '../../assets/game/bell.svg';
import bellMisfireIcon from '../../assets/game/bell-misfire.svg';
import bellSuccessIcon from '../../assets/game/bell-success.svg';
import type { BellState } from './game-view';

interface BellProps {
  state: BellState;
  pileCount: number;
  disabled: boolean;
  onRing: () => void;
}

/** 테이블 가운데 종과 종 아래 보관 스택 수. 판정 결과에 따라 라임(정답)·핑크(오발) 링이 켜진다 */
export function Bell({ state, pileCount, disabled, onRing }: BellProps) {
  const glow = state.kind === 'success' || state.kind === 'misfire' ? state.kind : null;
  const icon =
    glow === 'success' ? bellSuccessIcon : glow === 'misfire' ? bellMisfireIcon : bellIcon;
  return (
    <div className="bell">
      <button
        type="button"
        className={glow ? 'bell-button glow' : 'bell-button'}
        aria-label="종 누르기"
        aria-keyshortcuts="Space"
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
      <p className="bell-pile">
        보관 <span>{pileCount}</span>
      </p>
    </div>
  );
}
