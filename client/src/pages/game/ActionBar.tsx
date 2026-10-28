import type { MyPhase } from './game-view';

export function Key({ label }: { label: string }) {
  return <kbd className="key">{label}</kbd>;
}

function phaseLabel(phase: MyPhase, turnNickname?: string) {
  switch (phase) {
    case 'turn':
      return { text: 'YOUR TURN', className: 'mono accent' };
    case 'first':
      return { text: '곧 시작 · 첫 차례', className: 'accent' };
    case 'waiting':
      return { text: turnNickname ? `WAITING · ${turnNickname} 차례` : 'WAITING', className: '' };
    case 'judging':
      return { text: 'WAITING', className: 'mono' };
    case 'spectating':
      return { text: 'OUT · 관전 중', className: 'danger' };
  }
}

interface ActionBarProps {
  nickname: string;
  deckCount: number;
  phase: MyPhase;
  turnNickname?: string;
  /** 방 나가기 요청을 보내는 중 */
  leaving: boolean;
  onPlayCard: () => void;
  onLeave: () => void;
}

/** 화면 아래 내 상태 바: 내 덱 수, 카드 내기(J), 종(SPACE) 단축키 안내 */
export function ActionBar({
  nickname,
  deckCount,
  phase,
  turnNickname,
  leaving,
  onPlayCard,
  onLeave,
}: ActionBarProps) {
  const label = phaseLabel(phase, turnNickname);
  const spectating = phase === 'spectating';
  return (
    <section className={`action-bar ${phase}`} aria-label="내 상태">
      <div className="my-deck" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="action-bar-status">
        <p className={`action-bar-label ${label.className}`}>{label.text}</p>
        <p className="action-bar-name">
          {nickname}
          <span>
            덱 <b>{deckCount}</b>
          </span>
        </p>
      </div>
      <div className="action-bar-control">
        {spectating ? (
          <button
            type="button"
            className="action-button leave"
            aria-keyshortcuts="J"
            disabled={leaving}
            onClick={onLeave}
          >
            {leaving ? '나가는 중…' : '로비로 나가기'}
          </button>
        ) : (
          <button
            type="button"
            className="action-button play"
            aria-keyshortcuts="J"
            disabled={phase !== 'turn'}
            onClick={onPlayCard}
          >
            카드 내기
          </button>
        )}
        <Key label="J" />
      </div>
      <span className="action-bar-divider" aria-hidden="true" />
      <p className="action-bar-control bell-hint">
        종 <Key label="SPACE" />
      </p>
    </section>
  );
}
