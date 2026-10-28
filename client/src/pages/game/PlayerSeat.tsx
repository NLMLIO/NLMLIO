import type { CSSProperties } from 'react';
import type { PlayerColor, PlayerView, SeatOutcome } from './game-view';

export function playerColorStyle(color: PlayerColor): CSSProperties {
  return { '--player-color': `var(--fruit-${color})` } as CSSProperties;
}

export function PlayerAvatar({ nickname, color }: { nickname: string; color: PlayerColor }) {
  return (
    <span className="avatar player-avatar" style={playerColorStyle(color)} aria-hidden="true">
      {nickname.slice(0, 1)}
    </span>
  );
}

function formatSeconds(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const OUTCOME_BADGE_CLASS: Record<SeatOutcome['tone'], string> = {
  win: 'accent wide',
  misfire: 'danger text',
  receive: 'accent',
};

/** 슬롯 아래 배지는 하나만: 탈락·연결 끊김 > 판정 결과 > 현재 차례 */
function seatBadge(player: PlayerView) {
  if (player.state === 'out') return { className: 'danger', label: 'OUT' };
  if (player.state === 'offline')
    return {
      className: 'offline wide',
      label: `OFFLINE ${formatSeconds(player.offlineSeconds ?? 0)}`,
    };
  if (player.outcome)
    return { className: OUTCOME_BADGE_CLASS[player.outcome.tone], label: player.outcome.label };
  if (player.isTurn) return { className: 'accent', label: 'TURN' };
  return null;
}

/** 테이블 둘레의 다른 플레이어 자리: 아바타·닉네임·남은 카드 수와 상태 배지 */
export function PlayerSeat({
  player,
  growsUp,
  style,
}: {
  player: PlayerView;
  growsUp: boolean;
  style: CSSProperties;
}) {
  const badge = seatBadge(player);
  return (
    <div className={`player-seat ${player.state}${growsUp ? ' grows-up' : ''}`} style={style}>
      <div className="player-seat-avatar">
        <PlayerAvatar nickname={player.nickname} color={player.color} />
        {player.emote && <span className="player-emote">{player.emote}</span>}
      </div>
      <p className="player-seat-name">{player.nickname}</p>
      <p className="deck-count" aria-label={`남은 카드 ${player.deckCount}장`}>
        <span className="deck-icon" aria-hidden="true" />
        {player.deckCount}
      </p>
      {badge && <span className={`seat-badge ${badge.className}`}>{badge.label}</span>}
    </div>
  );
}
