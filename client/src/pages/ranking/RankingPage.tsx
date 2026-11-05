import { useState } from 'react';
import { RANKING_LIMIT } from '@nlmlio/shared';
import type { RankingEntry, RankingResponse } from '@nlmlio/shared';
import { useApiResource } from '../../hooks/use-api-resource';
import { Pagination, PageState } from '../../components/PageState';

const AVATAR_COLORS = ['#c5f52a', '#ff4f8b', '#ffd23f', '#a77bff'];

function winRate({ wins, losses }: RankingEntry): string {
  const games = wins + losses;
  return `${games > 0 ? ((wins / games) * 100).toFixed(1) : '0.0'}%`;
}

function StandingRow({ entry, mine }: { entry: RankingEntry; mine: boolean }) {
  return (
    <tr className={mine ? 'my-row' : ''}>
      <td className={`rank-cell${entry.rank <= 3 ? ' lime' : ''}`}>
        {entry.rank.toLocaleString()}
      </td>
      <td>
        <span className="player-cell">
          <span
            className="avatar tiny"
            style={{
              background: mine ? undefined : AVATAR_COLORS[entry.userId % AVATAR_COLORS.length],
            }}
            aria-hidden="true"
          >
            {entry.nickname.slice(0, 1)}
          </span>
          {entry.nickname}
          {mine && <span className="me-label">ME</span>}
        </span>
      </td>
      <td>{entry.wins.toLocaleString()}</td>
      <td className="muted">{(entry.wins + entry.losses).toLocaleString()}</td>
      <td className="muted">{winRate(entry)}</td>
    </tr>
  );
}

export function RankingPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApiResource<RankingResponse>(
    `/ranking?page=${page}&pageSize=10`,
  );
  return (
    <main className="records-page">
      <h1>글로벌 랭킹</h1>
      <div className="records-subheading">
        <p className="page-description">승수 기준 · 동점이면 승률이 높은 순</p>
        {data && <span className="players-count">{data.total.toLocaleString()} PLAYERS</span>}
      </div>
      <PageState loading={loading} error={error} retry={reload} />
      {!loading && !error && data && (
        <>
          <div className="table-scroll">
            <table className="records-table ranking-table">
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">PLAYER</th>
                  <th scope="col">WINS</th>
                  <th scope="col">GAMES</th>
                  <th scope="col">WIN RATE</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <StandingRow
                    key={entry.userId}
                    entry={entry}
                    mine={entry.userId === data.me.userId}
                  />
                ))}
              </tbody>
              {/* 상위 RANKING_LIMIT위 안이면 목록의 제자리에서, 밖이면 표 맨 아래에 내 순위를 보인다. */}
              {data.me.rank > RANKING_LIMIT && (
                <tfoot className="my-standing">
                  <StandingRow entry={data.me} mine />
                </tfoot>
              )}
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </main>
  );
}
