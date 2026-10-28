import type { RankingEntry } from './game-view';
import { PlayerAvatar } from './PlayerSeat';

interface GameResultProps {
  ranking: RankingEntry[];
  onLobby: () => void;
  onWaitingRoom: () => void;
}

/** 게임 결과 · 최종 순위(FUNC-005-10) */
export function GameResult({ ranking, onLobby, onWaitingRoom }: GameResultProps) {
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
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="game-result-actions">
        <button type="button" className="button outline" onClick={onLobby}>
          로비로
        </button>
        <button type="button" className="button primary" onClick={onWaitingRoom}>
          대기실로 돌아가기
        </button>
      </div>
    </main>
  );
}
