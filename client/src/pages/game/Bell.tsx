import bellIcon from '../../assets/game/bell.svg';
import bellMisfireIcon from '../../assets/game/bell-misfire.svg';
import bellSuccessIcon from '../../assets/game/bell-success.svg';
import type { CSSProperties } from 'react';
import { BrokenBell } from './skill/SkillMotion';
import { bellCenter, BELL_CENTER, type BellMoveView, type BellState } from './game-view';

interface BellProps {
  state: BellState;
  pileCount: number;
  disabled: boolean;
  onRing: (bell?: number) => void;
  /** 종 옮기기 진행 중이면 옮겨진 자리와 새 키 */
  moved?: BellMoveView;
  /** 종 부수기 효과가 유지 중인지 */
  broken?: boolean;
  breakStrike?: number;
  /** 해킹당했으면 새 종 치기 키 */
  hackKey?: string;
  /** 종 야바위 중이면 종마다의 단축키(번호 순서)와 남은 시간 */
  shell?: { keys: string[]; seconds: number };
  /** 러시안 룰렛: 종 위에 올려 둔 리볼버의 남은 탄. 없으면 비워 둔다 */
}

/** 테이블 가운데 종과 종 아래 보관 스택 수. 판정 결과에 따라 라임(정답)·핑크(오발) 링이 켜진다 */
export function Bell({
  state,
  pileCount,
  disabled,
  onRing,
  moved,
  broken,
  breakStrike,
  hackKey,
  shell: activeShell,
}: BellProps) {
  const shell = broken ? undefined : activeShell;
  const center = bellCenter(moved, !!shell);
  const keyChip = hackKey ?? moved?.key;
  const glow = state.kind === 'success' || state.kind === 'misfire' ? state.kind : null;
  const icon =
    glow === 'success' ? bellSuccessIcon : glow === 'misfire' ? bellMisfireIcon : bellIcon;
  return (
    <div
      className={`bell${shell ? ' has-shell' : ''}${moved && !shell ? ' is-moved' : ''}${broken ? ' is-broken' : ''}`}
      style={
        moved
          ? ({
              '--bell-dx': `${center.x - BELL_CENTER.x}px`,
              '--bell-dy': `${center.y - BELL_CENTER.y}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {keyChip && !shell && !broken && (
        <span className="bell-key" role="status" aria-label={`${keyChip} 키로 치기`}>
          {keyChip}
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
      {shell && (
        <div className="bell-shell" role="group" aria-label={`종 야바위 ${shell.seconds}초`}>
          {shell.keys.map((key, index) => (
            <button
              key={key}
              type="button"
              className="bell-shell-bell"
              aria-label={`${key}번 종`}
              aria-keyshortcuts={key}
              disabled={disabled}
              onClick={() => onRing(index)}
            >
              <img src={bellIcon} alt="" />
              <kbd>{key}</kbd>
            </button>
          ))}
          <p className="bell-shell-time" role="timer">
            종 야바위 · {shell.seconds}초
          </p>
        </div>
      )}
      <button
        type="button"
        className={glow ? 'bell-button glow' : 'bell-button'}
        aria-label="종 누르기"
        aria-keyshortcuts={keyChip ?? 'Space'}
        disabled={disabled || !!shell}
        onClick={() => onRing()}
      >
        {broken ? (
          <BrokenBell key={breakStrike ?? 'broken'} strike={breakStrike !== undefined} />
        ) : (
          <img src={icon} alt="" />
        )}
      </button>
      {state.kind === 'countdown' && (
        <div className="bell-countdown" role="timer" aria-label={`${state.value}초 뒤 시작`}>
          {state.value}
        </div>
      )}
      {state.kind === 'last-chance' && !broken && (
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
