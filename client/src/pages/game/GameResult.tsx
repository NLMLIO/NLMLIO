import type { RankingEntry } from './game-view';
import { PlayerAvatar } from './PlayerSeat';

interface GameResultProps {
  ranking: RankingEntry[];
  onLobby: () => void;
  onWaitingRoom: () => void;
  /** 결과 저장 중·실패 안내 */
  notice?: string;
  /** 요청을 보내는 중이면 버튼을 잠근다 */
  busy?: boolean;
}

/** 게임 결과 · 최종 순위(FUNC-005-10) */
export function GameResult({
  ranking,
  onLobby,
  onWaitingRoom,
  notice,
  busy = false,
}: GameResultProps) {
  const winner = ranking.find((entry) => entry.rank === 1);
  return (
    <main className="game-result">
      <header className="game-result-title">
        <p>GAME OVER</p>
        <h1>
          <span className="lime">{winner?.nickname}</span>
          <span>최종 승리</span>
        </h1>
      </header>
      <section className="result-ranking" aria-label="최종 순위">
        <p className="result-ranking-head" aria-hidden="true">
          <span>RANK</span>
          <span>PLAYER</span>
        </p>
        <ol>
          {ranking.map((entry) => (
            <li key={entry.rank} className={entry.rank === 1 ? 'winner' : undefined}>
              <span className={`result-rank rank-${Math.min(entry.rank, 4)}`}>{entry.rank}</span>
              <span className="result-player">
                <PlayerAvatar nickname={entry.nickname} color={entry.color} />
                {entry.nickname}
                {entry.isMe && <small>YOU</small>}
                {entry.departed && <small className="departed">이탈</small>}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {notice && (
        <p className="game-result-notice" role="status">
          {notice}
        </p>
      )}
      <div className="game-result-actions">
        <button type="button" className="button outline" disabled={busy} onClick={onLobby}>
          로비로
        </button>
        <button type="button" className="button primary" disabled={busy} onClick={onWaitingRoom}>
          대기실로 돌아가기
        </button>
      </div>
    </main>
  );
}
