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
  onRing: (bell?: number) => void;
  /** 종 옮기기 진행 중이면 옮겨진 자리와 새 키 */
  moved?: BellMoveView;
  /** 종 부수기로 부서져 있으면 복구까지 남은 시간 */
  broken?: { seconds: number };
  /** 해킹당했으면 새 종 치기 키 */
  hackKey?: string;
  /** 종 야바위 중이면 종마다의 단축키(번호 순서)와 남은 시간 */
  shell?: { keys: string[]; seconds: number };
}

/** 테이블 가운데 종과 종 아래 보관 스택 수. 판정 결과에 따라 라임(정답)·핑크(오발) 링이 켜진다 */
export function Bell({
  state,
  pileCount,
  disabled,
  onRing,
  moved,
  broken,
  hackKey,
  shell,
}: BellProps) {
  const keyChip = hackKey ?? moved?.key;
  const glow = state.kind === 'success' || state.kind === 'misfire' ? state.kind : null;
  const icon =
    glow === 'success' ? bellSuccessIcon : glow === 'misfire' ? bellMisfireIcon : bellIcon;
  return (
    <div
      className={`bell${moved ? ' is-moved' : ''}${broken ? ' is-broken' : ''}`}
      style={
        moved
          ? ({
              '--bell-dx': `${MOVE_OFFSETS[moved.position % MOVE_OFFSETS.length].x}px`,
              '--bell-dy': `${MOVE_OFFSETS[moved.position % MOVE_OFFSETS.length].y}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {keyChip && (
        <span className="bell-key" role="status" aria-label={`${keyChip} 키로 치기`}>
          {keyChip}
        </span>
      )}
      {broken && (
        <span
          className="bell-broken"
          role="timer"
          aria-label={`종이 부서졌어요 ${broken.seconds}초`}
        >
          종이 부서졌어요 · {broken.seconds}초
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
          {shell.keys.map((key, index) => {
            const angle = (index / shell.keys.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <button
                key={index}
                type="button"
                className="bell-shell-bell"
                aria-label={`${index + 1}번 종 · ${key} 키`}
                aria-keyshortcuts={key}
                disabled={disabled}
                style={
                  {
                    '--shell-x': `${Math.cos(angle) * 150}px`,
                    '--shell-y': `${Math.sin(angle) * 120}px`,
                  } as CSSProperties
                }
                onClick={() => onRing(index)}
              >
                <img src={bellIcon} alt="" />
                <kbd>{key}</kbd>
              </button>
            );
          })}
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
