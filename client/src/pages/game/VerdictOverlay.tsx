import type { Verdict } from './game-view';
import { PlayerAvatar } from './PlayerSeat';

/** 종 판정 결과(FUNC-005-07·08): 종을 누른 사람과 정답/오발, 판정 근거를 보드 위에 크게 띄운다 */
export function VerdictOverlay({ verdict }: { verdict: Verdict }) {
  return (
    <div className={`verdict-overlay ${verdict.tone}`} role="alert">
      <div className="verdict-ringer">
        <PlayerAvatar nickname={verdict.ringer.nickname} color={verdict.ringer.color} />
        <div>
          <p>종을 누른 사람</p>
          <strong>{verdict.ringer.nickname}</strong>
        </div>
      </div>
      <p className="verdict-title">{verdict.tone === 'success' ? '정답!' : '오발!'}</p>
      <p className="verdict-formula">{verdict.formula}</p>
      <p className="verdict-detail">{verdict.detail}</p>
    </div>
  );
}
