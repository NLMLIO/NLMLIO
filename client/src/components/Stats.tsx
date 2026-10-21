import type { PlayerStats } from '@nlmlio/shared';

export function reactionTime(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(2)}s`;
}

export function Stats({ stats }: { stats: PlayerStats }) {
  const values = [
    ['총 게임', stats.totalGames.toLocaleString()],
    ['승', stats.wins.toLocaleString()],
    ['패', stats.losses.toLocaleString()],
    ['승률', `${stats.winRate.toFixed(1)}%`],
    ['종 치기 성공률', `${stats.bellSuccessRate.toFixed(1)}%`],
    ['평균 반응 속도', reactionTime(stats.averageReactionMs)],
  ];
  return (
    <dl className="stats-strip">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={label === '승' ? 'lime' : ''}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
